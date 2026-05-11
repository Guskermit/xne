"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EngagementOption = {
  engagement_id: string;
  engagement_name: string;
  project_name: string;
  client_name: string;
  budget?: number | null;
};

type MonthlyKpi = {
  mes: string;
  horas: number;
  nsr: number;
  ansr: number;
  coste_margen: number;
  margen_bruto: number;
  gasto_total: number;
  ter: number;
};

type ForecastRow = {
  mes: string;
  horas: number;
  ansr: number;
  coste: number;
  gastos: number;
  exhaustionDate: string | null; // 'YYYY-MM-DD' if budget runs out during this month
};

type ForecastResult = {
  rows: ForecastRow[];
  exhaustionDate: string | null; // null = budget lasts through FY end
};

type ForecastParams = {
  headcount: number;
  lastDate: string | null; // 'YYYY-MM-DD'
};

type EmployeeRow = {
  employee_gui: string;
  employee_name: string | null;
  rank_code: string | null;
  horas: number;
  nsr: number;
  ansr: number;
  coste_margen: number;
  margen_bruto: number;
};

// ---------------------------------------------------------------------------
// Forecast helpers
// ---------------------------------------------------------------------------

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateToMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Easter Sunday (Gregorian) → [month 1-based, day] */
function easterDate(year: number): [number, number] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m2 + 114) / 31);
  const day = ((h + l - 7 * m2 + 114) % 31) + 1;
  return [month, day];
}

/** Spanish national holidays for a given year */
function spanishHolidays(year: number): Set<string> {
  const s = new Set<string>();
  const add = (m: number, d: number) =>
    s.add(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  add(1, 1); add(1, 6); add(5, 1); add(8, 15);
  add(10, 12); add(11, 1); add(12, 6); add(12, 8); add(12, 25);
  const [em, ed] = easterDate(year);
  const gf = new Date(year, em - 1, ed);
  gf.setDate(gf.getDate() - 2); // Viernes Santo
  add(gf.getMonth() + 1, gf.getDate());
  return s;
}

/**
 * Day-by-day forecast.
 * Starts from the day after `lastDate` (handles partial months automatically).
 * Each working day contributes headcount × (9h Mon–Thu | 6h Fri).
 * Stops when accumulated ANSR reaches `remaining` or June 30 of FY.
 */
function buildForecast(params: {
  empHoursPerDay: number[]; // Mon–Thu hours per active employee; Fri = h × 6/9
  lastDate: string | null;
  ansrPerHour: number;
  costPerHour: number;
  gastosMensuales: number;
  remaining: number;
  fy: number;
}): ForecastResult {
  const { empHoursPerDay, lastDate, ansrPerHour, costPerHour, gastosMensuales, remaining, fy } = params;
  const totalHPerDay    = empHoursPerDay.reduce((s, h) => s + h, 0);
  const totalHPerDayFri = empHoursPerDay.reduce((s, h) => s + h * (6 / 9), 0);

  if (remaining <= 0 || ansrPerHour <= 0 || totalHPerDay === 0) {
    return { rows: [], exhaustionDate: null };
  }

  const startDate = lastDate
    ? (() => { const d = parseLocalDate(lastDate); d.setDate(d.getDate() + 1); return d; })()
    : new Date(fy - 1, 6, 1); // Jul 1 of fy-1

  const endDate = new Date(fy, 5, 30); // Jun 30 of fy

  if (startDate > endDate) return { rows: [], exhaustionDate: null };

  const holidaysByYear = new Map<number, Set<string>>();
  const getHolidays = (year: number) => {
    if (!holidaysByYear.has(year)) holidaysByYear.set(year, spanishHolidays(year));
    return holidaysByYear.get(year)!;
  };

  // Pass 1: count working days per month (needed to distribute monthly expenses evenly)
  const workingDaysPerMes = new Map<string, number>();
  {
    const tmp = new Date(startDate);
    while (tmp <= endDate) {
      const dow = tmp.getDay();
      if (dow !== 0 && dow !== 6 && !getHolidays(tmp.getFullYear()).has(dateToKey(tmp))) {
        const mes = dateToMes(tmp);
        workingDaysPerMes.set(mes, (workingDaysPerMes.get(mes) ?? 0) + 1);
      }
      tmp.setDate(tmp.getDate() + 1);
    }
  }

  const buckets = new Map<string, { horas: number; ansr: number; coste: number; gastos: number; exhaustionDate: string | null }>();
  let accBurn = 0; // accumulated TER (ANSR + gastos) burn against remaining budget
  let exhaustionDate: string | null = null;

  // Pass 2: day-by-day simulation
  const cur = new Date(startDate);
  outer: while (cur <= endDate) {
    const dow = cur.getDay(); // 0=Sun … 6=Sat
    if (dow !== 0 && dow !== 6) {
      const key = dateToKey(cur);
      if (!getHolidays(cur.getFullYear()).has(key)) {
        const hoursToday = dow === 5 ? totalHPerDayFri : totalHPerDay;
        const ansrToday = hoursToday * ansrPerHour;
        const costeToday = hoursToday * costPerHour;
        const mes = dateToMes(cur);
        const wdInMes = workingDaysPerMes.get(mes) ?? 1;
        const gastosToday = gastosMensuales / wdInMes;
        const burnToday = ansrToday + gastosToday;

        if (!buckets.has(mes)) buckets.set(mes, { horas: 0, ansr: 0, coste: 0, gastos: 0, exhaustionDate: null });
        const b = buckets.get(mes)!;

        if (accBurn + burnToday >= remaining) {
          const fraction = (remaining - accBurn) / burnToday;
          b.horas += hoursToday * fraction;
          b.ansr += ansrToday * fraction;
          b.coste += costeToday * fraction;
          b.gastos += gastosToday * fraction;
          b.exhaustionDate = key;
          exhaustionDate = key;
          break outer;
        } else {
          b.horas += hoursToday;
          b.ansr += ansrToday;
          b.coste += costeToday;
          b.gastos += gastosToday;
          accBurn += burnToday;
        }
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  const rows: ForecastRow[] = [...buckets.entries()].map(([mes, v]) => ({
    mes,
    horas: v.horas,
    ansr: v.ansr,
    coste: v.coste,
    gastos: v.gastos,
    exhaustionDate: v.exhaustionDate,
  }));

  return { rows, exhaustionDate };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurDec = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const hrs = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

function fmtMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function pctColor(ansr: number, margin: number): string {
  if (!ansr) return "text-gray-400";
  const p = (margin / ansr) * 100;
  if (p >= 20) return "text-green-600 dark:text-green-400";
  if (p >= 0) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function pct(ansr: number, margin: number): string {
  if (!ansr) return "—";
  return `${((margin / ansr) * 100).toFixed(1)} %`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ProjectMonthlyKpis() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear = fyStr ? parseInt(fyStr, 10) : null;

  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rows, setRows] = useState<MonthlyKpi[]>([]);
  const [forecastParams, setForecastParams] = useState<ForecastParams | null>(null);
  const [empData, setEmpData] = useState<Map<string, EmployeeRow[]>>(new Map());
  const [disabledEmps, setDisabledEmps] = useState<Set<string>>(new Set());
  const [empFcHours, setEmpFcHours] = useState<Map<string, number>>(new Map());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload engagement list when FY changes
  useEffect(() => {
    setLoadingList(true);
    const params = fiscalYear ? { p_fiscal_year: fiscalYear } : {};
    supabase
      .rpc("get_engagement_kpis", params)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          const list = (data as EngagementOption[]) ?? [];
          setEngagements(list);
          setSelectedId(list.length > 0 ? list[0].engagement_id : "");
        }
        setLoadingList(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  // Load monthly KPIs + forecast params when selection or FY changes
  useEffect(() => {
    if (!selectedId) { setRows([]); setForecastParams(null); setEmpData(new Map()); setEmpFcHours(new Map()); setExpandedMonths(new Set()); return; }
    setLoadingData(true);
    setError(null);
    const params: Record<string, unknown> = { p_engagement_id: selectedId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    setExpandedMonths(new Set());
    Promise.all([
      supabase.rpc("get_project_monthly_kpis", params),
      supabase.rpc("get_engagement_forecast_params", params),
      supabase.rpc("get_project_employee_monthly_kpis", params),
    ]).then(([kpiRes, fcRes, empRes]) => {
      if (kpiRes.error) {
        setError(kpiRes.error.message);
        setRows([]);
      } else {
        setRows((kpiRes.data as MonthlyKpi[]) ?? []);
      }
      const fcData = fcRes.data as Array<{ headcount: number; last_date: string | null }> | null;
      if (!fcRes.error && fcData && fcData.length > 0 && fcData[0].headcount > 0) {
        setForecastParams({
          headcount: fcData[0].headcount,
          lastDate: fcData[0].last_date ? String(fcData[0].last_date).slice(0, 10) : null,
        });
      } else {
        setForecastParams(null);
      }
      // Build employee data map: mes → EmployeeRow[]
      const empRows = (empRes.data ?? []) as Array<EmployeeRow & { mes: string }>;
      const empMap = new Map<string, EmployeeRow[]>();
      for (const { mes, ...rest } of empRows) {
        if (!empMap.has(mes)) empMap.set(mes, []);
        empMap.get(mes)!.push(rest as EmployeeRow);
      }
      setEmpData(empMap);
      setLoadingData(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, fiscalYear]);

  // ---------------------------------------------------------------------------
  // Employee-aware derived data
  // ---------------------------------------------------------------------------
  const allEmployees = useMemo(() => {
    const map = new Map<string, { name: string | null; rank: string | null }>();
    empData.forEach((emps) =>
      emps.forEach((e) => {
        if (!map.has(e.employee_gui))
          map.set(e.employee_gui, { name: e.employee_name, rank: e.rank_code });
      })
    );
    return map;
  }, [empData]);

  const activeHeadcount = useMemo(
    () => [...allEmployees.keys()].filter((g) => !disabledEmps.has(g)).length,
    [allEmployees, disabledEmps]
  );

  // Array of daily hours (Mon–Thu) per active employee — drives buildForecast
  const empHoursPerDayArr = useMemo(() => {
    const activeGuids = [...allEmployees.keys()].filter((g) => !disabledEmps.has(g));
    if (activeGuids.length > 0) return activeGuids.map((g) => empFcHours.get(g) ?? 9);
    if (forecastParams && forecastParams.headcount > 0) return Array<number>(forecastParams.headcount).fill(9);
    return [];
  }, [allEmployees, disabledEmps, empFcHours, forecastParams]);

  // Monthly rows recomputed from active employees (falls back to raw rows when no emp data)
  const filteredRows = useMemo((): MonthlyKpi[] => {
    if (empData.size === 0) return rows;
    return rows.map((r) => {
      const activeEmps = (empData.get(r.mes) ?? []).filter(
        (e) => !disabledEmps.has(e.employee_gui)
      );
      const horas        = activeEmps.reduce((s, e) => s + e.horas, 0);
      const nsr          = activeEmps.reduce((s, e) => s + e.nsr, 0);
      const ansr         = activeEmps.reduce((s, e) => s + e.ansr, 0);
      const coste_margen = activeEmps.reduce((s, e) => s + e.coste_margen, 0);
      const margen_bruto = activeEmps.reduce((s, e) => s + e.margen_bruto, 0);
      return { ...r, horas, nsr, ansr, coste_margen, margen_bruto, ter: ansr + r.gasto_total };
    });
  }, [rows, empData, disabledEmps]);

  // ---------------------------------------------------------------------------
  // Totals
  // ---------------------------------------------------------------------------
  const totalHoras  = filteredRows.reduce((s, r) => s + r.horas, 0);
  const totalNsr    = filteredRows.reduce((s, r) => s + r.nsr, 0);
  const totalAnsr   = filteredRows.reduce((s, r) => s + r.ansr, 0);
  const totalCoste  = filteredRows.reduce((s, r) => s + r.coste_margen, 0);
  const totalMargen = filteredRows.reduce((s, r) => s + r.margen_bruto, 0);
  const totalGastos = filteredRows.reduce((s, r) => s + r.gasto_total, 0);
  const totalTer    = filteredRows.reduce((s, r) => s + r.ter, 0);

  // Running accumulators (mutated during render)
  let accHoras  = 0;
  let accAnsr   = 0;
  let accGastos = 0;
  let accTer    = 0;

  // ---------------------------------------------------------------------------
  // Forecast
  // ---------------------------------------------------------------------------
  const effectiveFY = useMemo(() => {
    if (fiscalYear) return fiscalYear;
    const today = new Date();
    const m = today.getMonth() + 1;
    return m >= 7 ? today.getFullYear() + 1 : today.getFullYear();
  }, [fiscalYear]);

  const selected = engagements.find((e) => e.engagement_id === selectedId);
  const budget = selected?.budget ?? null;
  const ansrPerHour = totalHoras > 0 ? totalAnsr / totalHoras : 0;
  const costPerHour = totalHoras > 0 ? totalCoste / totalHoras : 0;
  // Average monthly expense rate based on historical months with data
  const gastosMensuales = filteredRows.length > 0 ? totalGastos / filteredRows.length : 0;

  const forecastResult = useMemo((): ForecastResult => {
    if (!budget || budget <= 0 || !forecastParams || totalHoras === 0) {
      return { rows: [], exhaustionDate: null };
    }
    return buildForecast({
      empHoursPerDay: empHoursPerDayArr,
      lastDate: forecastParams.lastDate,
      ansrPerHour,
      costPerHour,
      gastosMensuales,
      remaining: budget - totalTer,
      fy: effectiveFY,
    });
  }, [budget, forecastParams, totalHoras, empHoursPerDayArr, ansrPerHour, costPerHour, gastosMensuales, totalTer, effectiveFY]);

  const { rows: forecastRows, exhaustionDate } = forecastResult;
  const forecastTotalHoras  = forecastRows.reduce((s, r) => s + r.horas, 0);
  const forecastTotalAnsr   = forecastRows.reduce((s, r) => s + r.ansr, 0);
  const forecastTotalCoste  = forecastRows.reduce((s, r) => s + r.coste, 0);
  const forecastTotalGastos = forecastRows.reduce((s, r) => s + r.gastos, 0);
  const forecastTotalTer    = forecastTotalAnsr + forecastTotalGastos;

  const toggleMonth    = (mes: string) =>
    setExpandedMonths((prev) => { const n = new Set(prev); n.has(mes) ? n.delete(mes) : n.add(mes); return n; });
  const toggleEmployee = (gui: string) =>
    setDisabledEmps((prev) => { const n = new Set(prev); n.has(gui) ? n.delete(gui) : n.add(gui); return n; });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loadingList) {
    return (
      <section className="w-full max-w-7xl space-y-4">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </section>
    );
  }

  if (engagements.length === 0) return null;

  return (
    <section className="w-full max-w-7xl space-y-4">
      {/* Header + selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-lg font-semibold shrink-0">Evolución mensual</h2>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full sm:max-w-lg rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {engagements.map((e) => (
            <option key={e.engagement_id} value={e.engagement_id}>
              {e.client_name} — {e.project_name} — {e.engagement_name}
            </option>
          ))}
        </select>
      </div>

      {/* Subtitle */}
      {selected && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {selected.client_name} &rsaquo; {selected.project_name} &rsaquo;{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {selected.engagement_name}
          </span>
        </p>
      )}

      {error && (
        <p className="text-sm text-red-500">Error: {error}</p>
      )}

      {loadingData && (
        <div className="h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      )}

      {/* Budget exhaustion alert */}
      {!loadingData && exhaustionDate && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
          <div className="text-sm">
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              El presupuesto se agota el {fmtDate(exhaustionDate)}
            </span>
            <span className="text-amber-700 dark:text-amber-400 ml-2">
              — quedan {eur.format(budget! - totalTer)} de presupuesto
            </span>
          </div>
        </div>
      )}

      {/* No-budget-left when forecast exists through FY end */}
      {!loadingData && forecastRows.length > 0 && !exhaustionDate && budget && (
        <div className="flex items-center gap-3 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-4 py-3">
          <span className="text-green-500 text-lg leading-none">✓</span>
          <span className="text-sm font-medium text-green-800 dark:text-green-300">
            El presupuesto cubre todo el Fiscal Year FY{effectiveFY}.
          </span>
        </div>
      )}

      {!loadingData && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 whitespace-nowrap">Mes</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Horas</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Horas acum.</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">NSR</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">ANSR</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">ANSR acum.</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Coste</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Margen bruto</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">% Margen</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Gastos</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Gastos acum.</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">TER</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">TER acum.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">

              {/* ── Actual rows ── */}
              {filteredRows.map((r) => {
                accHoras  += r.horas;
                accAnsr   += r.ansr;
                accGastos += r.gasto_total;
                accTer    += r.ter;
                const isExp    = expandedMonths.has(r.mes);
                const monthEmps = empData.get(r.mes) ?? [];
                return (
                  <Fragment key={r.mes}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {monthEmps.length > 0 && (
                          <button
                            onClick={() => toggleMonth(r.mes)}
                            className="mr-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs"
                          >
                            {isExp ? "▼" : "▶"}
                          </button>
                        )}
                        {fmtMonth(r.mes)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {hrs.format(r.horas)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 dark:text-gray-500">
                        {hrs.format(accHoras)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {eur.format(r.nsr)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                        {eur.format(r.ansr)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 dark:text-gray-500">
                        {eur.format(accAnsr)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                        {eur.format(r.coste_margen)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                        {eur.format(r.margen_bruto)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pctColor(r.ansr, r.margen_bruto)}`}>
                        {pct(r.ansr, r.margen_bruto)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                        {r.gasto_total !== 0 ? eur.format(r.gasto_total) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 dark:text-gray-500">
                        {accGastos !== 0 ? eur.format(accGastos) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                        {eur.format(r.ter)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 dark:text-gray-500">
                        {eur.format(accTer)}
                      </td>
                    </tr>
                    {/* ── Employee sub-rows ── */}
                    {isExp && monthEmps.map((e) => {
                      const isDisabled = disabledEmps.has(e.employee_gui);
                      const empMargen  = e.ansr - e.coste_margen;
                      return (
                        <tr
                          key={`emp-${r.mes}-${e.employee_gui}`}
                          className={`text-xs border-l-4 ${
                            isDisabled
                              ? "opacity-40 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20"
                              : "border-indigo-200 dark:border-indigo-800 bg-gray-50/60 dark:bg-gray-800/20"
                          }`}
                        >
                          <td className="pl-8 pr-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            <button
                              onClick={() => toggleEmployee(e.employee_gui)}
                              className={`mr-2 rounded-full w-4 h-4 border text-[9px] leading-none inline-flex items-center justify-center flex-shrink-0 transition-colors ${
                                isDisabled
                                  ? "border-red-300 bg-red-50 text-red-500 dark:border-red-700 dark:bg-red-900/20"
                                  : "border-green-400 bg-green-50 text-green-600 dark:border-green-600 dark:bg-green-900/20"
                              }`}
                              title={isDisabled ? "Activar empleado" : "Desactivar empleado"}
                            >
                              {isDisabled ? "✕" : "✓"}
                            </button>
                            {e.employee_name ?? e.employee_gui}
                            {e.rank_code && <span className="ml-1.5 text-gray-400">· {e.rank_code}</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{hrs.format(e.horas)}</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right tabular-nums">{eur.format(e.nsr)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{eur.format(e.ansr)}</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right tabular-nums">{eur.format(e.coste_margen)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{eur.format(empMargen)}</td>
                          <td className={`px-4 py-2 text-right tabular-nums ${pctColor(e.ansr, empMargen)}`}>{pct(e.ansr, empMargen)}</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right tabular-nums">{eur.format(e.ansr)}</td>
                          <td className="px-4 py-2" />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}

              {/* ── Forecast separator ── */}
              {forecastRows.length > 0 && (
                <tr className="bg-blue-50 dark:bg-blue-950/30">
                  <td colSpan={13} className="px-4 py-2 text-xs font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400 border-t border-blue-200 dark:border-blue-800">
                    Forecast · {empHoursPerDayArr.length} empleados · {empHoursPerDayArr.reduce((s, h) => s + h, 0).toFixed(1)} h/día ·{" "}
                    {eurDec.format(ansrPerHour)}/h ANSR · {eurDec.format(costPerHour)}/h coste ·{" "}
                    {eur.format(gastosMensuales)}/mes gastos · presupuesto restante: {eur.format((budget ?? 0) - totalTer)}
                  </td>
                </tr>
              )}

              {/* ── Forecast rows ── */}
              {forecastRows.map((r) => {
                accHoras  += r.horas;
                accAnsr   += r.ansr;
                accGastos += r.gastos;
                accTer    += r.ansr + r.gastos;
                const fcMargen   = r.ansr - r.coste;
                const isFcExp    = expandedMonths.has(`fc-${r.mes}`);
                const activeEmps = [...allEmployees.entries()].filter(([g]) => !disabledEmps.has(g));
                const totalDailyH = activeEmps.reduce((s, [g]) => s + (empFcHours.get(g) ?? 9), 0) || 1;
                return (
                  <Fragment key={`fc-${r.mes}`}>
                    <tr className="bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-100/60 dark:hover:bg-blue-950/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
                        {activeEmps.length > 0 && (
                          <button
                            onClick={() => toggleMonth(`fc-${r.mes}`)}
                            className="mr-2 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 text-xs"
                          >
                            {isFcExp ? "▼" : "▶"}
                          </button>
                        )}
                        {fmtMonth(r.mes)}
                        {r.exhaustionDate && (
                          <span className="ml-1.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded px-1 py-0.5 align-middle whitespace-nowrap">
                            hasta {parseLocalDate(r.exhaustionDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                          </span>
                        )}
                        {!r.exhaustionDate && (
                          <span className="ml-1.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded px-1 py-0.5 align-middle">
                            FC
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-600 dark:text-blue-300">
                        {hrs.format(r.horas)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-400 dark:text-blue-500">
                        {hrs.format(accHoras)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-300 dark:text-blue-600">—</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700 dark:text-blue-300">
                        {eur.format(r.ansr)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-400 dark:text-blue-500">
                        {eur.format(accAnsr)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-500 dark:text-blue-400">
                        {eur.format(r.coste)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700 dark:text-blue-300">
                        {eur.format(fcMargen)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pctColor(r.ansr, fcMargen)}`}>
                        {pct(r.ansr, fcMargen)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-500 dark:text-blue-400">
                        {eur.format(r.gastos)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-400 dark:text-blue-500">
                        {eur.format(accGastos)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700 dark:text-blue-300">
                        {eur.format(r.ansr + r.gastos)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-400 dark:text-blue-500">
                        {eur.format(accTer)}
                      </td>
                    </tr>
                    {/* ── Projected employee rows ── */}
                    {isFcExp && activeEmps.map(([gui, emp]) => {
                      const empDailyH   = empFcHours.get(gui) ?? 9;
                      const empMonthlyH = (empDailyH / totalDailyH) * r.horas;
                      const empAnsrVal  = empMonthlyH * ansrPerHour;
                      const empCosteVal = empMonthlyH * costPerHour;
                      const empFcMargen = empAnsrVal - empCosteVal;
                      return (
                        <tr
                          key={`fcEmp-${r.mes}-${gui}`}
                          className="text-xs border-l-4 border-blue-100 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/10"
                        >
                          <td className="pl-8 pr-4 py-2 text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            <span className="mr-1.5 text-[9px] font-semibold bg-blue-100 dark:bg-blue-900 text-blue-500 dark:text-blue-300 rounded px-1 py-0.5">FC</span>
                            {emp.name ?? gui}
                            {emp.rank && <span className="ml-1.5 text-blue-400">· {emp.rank}</span>}
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.5}
                              value={empDailyH}
                              onChange={(ev) => {
                                const v = parseFloat(ev.target.value);
                                if (!isNaN(v) && v >= 0)
                                  setEmpFcHours((prev) => { const m = new Map(prev); m.set(gui, v); return m; });
                              }}
                              className="ml-2 w-12 rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 px-1 py-0.5 text-right text-xs text-blue-700 dark:text-blue-300 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
                              title="Horas por día laborable (lun–jue)"
                            />
                            <span className="text-blue-400 text-[10px] ml-0.5">h/d</span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-blue-500 dark:text-blue-400">{hrs.format(empMonthlyH)}</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right text-blue-300 dark:text-blue-700">—</td>
                          <td className="px-4 py-2 text-right tabular-nums text-blue-600 dark:text-blue-400">{eur.format(empAnsrVal)}</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right tabular-nums text-blue-500 dark:text-blue-400">{eur.format(empCosteVal)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-blue-600 dark:text-blue-400">{eur.format(empFcMargen)}</td>
                          <td className={`px-4 py-2 text-right tabular-nums ${pctColor(empAnsrVal, empFcMargen)}`}>{pct(empAnsrVal, empFcMargen)}</td>
                          <td className="px-4 py-2 text-right text-blue-300 dark:text-blue-700">—</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right tabular-nums text-blue-600 dark:text-blue-400">{eur.format(empAnsrVal)}</td>
                          <td className="px-4 py-2" />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>

            <tfoot>
              {/* Real totals */}
              <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100">
                <td className="px-4 py-3">Real</td>
                <td className="px-4 py-3 text-right tabular-nums">{hrs.format(totalHoras)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalNsr)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalAnsr)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalCoste)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalMargen)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${pctColor(totalAnsr, totalMargen)}`}>
                  {pct(totalAnsr, totalMargen)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalGastos)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalTer)}</td>
                <td className="px-4 py-3" />
              </tr>
              {/* Forecast totals */}
              {forecastRows.length > 0 && (
                <tr className="bg-blue-50 dark:bg-blue-950/30 border-t border-blue-200 dark:border-blue-800 font-semibold text-blue-700 dark:text-blue-300">
                  <td className="px-4 py-3">Forecast</td>
                  <td className="px-4 py-3 text-right tabular-nums">{hrs.format(forecastTotalHoras)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right tabular-nums">{eur.format(forecastTotalAnsr)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{eur.format(forecastTotalCoste)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{eur.format(forecastTotalAnsr - forecastTotalCoste)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${pctColor(forecastTotalAnsr, forecastTotalAnsr - forecastTotalCoste)}`}>
                    {pct(forecastTotalAnsr, forecastTotalAnsr - forecastTotalCoste)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{eur.format(forecastTotalGastos)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{eur.format(forecastTotalTer)}</td>
                  <td className="px-4 py-3" />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {!loadingData && rows.length === 0 && !error && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No hay datos para este engagement.
        </p>
      )}

      {!loadingData && rows.length > 0 && !forecastParams && budget && totalHoras === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          Forecast no disponible: no hay horas imputadas suficientes para calcular las tasas.
        </p>
      )}
    </section>
  );
}

