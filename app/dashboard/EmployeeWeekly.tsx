"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

type Employee = { employee_gui: string; employee_name: string | null };

type DetailRow = {
  employee_gui: string;
  employee_name: string | null;
  engagement_id: string;
  engagement_name: string | null;
  week_key: string;
  activity_code: string | null;
  charged_hours: number;
  ansr_revenue: number;
};

type FlatRow =
  | { kind: "employee"; empGui: string; empName: string }
  | { kind: "engagement"; empGui: string; engId: string; engName: string; hasBreakdown: boolean }
  | { kind: "activity"; empGui: string; engId: string; act: string };

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtEur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const fmtH = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmtWeek(wk: string) {
  return new Date(wk + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmployeeWeekly({ fiscalYear }: { fiscalYear?: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Load employee list once
  useEffect(() => {
    supabase.rpc("get_employees_list").then(({ data }) => {
      if (data) setEmployees(data as Employee[]);
    });
  }, [supabase]);

  // Fetch detail when selection or FY changes
  useEffect(() => {
    if (selected.size === 0) { setRows([]); return; }
    setLoading(true);
    const params: Record<string, unknown> = { p_employee_guis: [...selected] };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase.rpc("get_employee_weekly_detail", params).then(({ data }) => {
      setRows((data as DetailRow[]) ?? []);
      setLoading(false);
    });
  }, [selected, fiscalYear, supabase]);

  const toggleEmp = useCallback((gui: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(gui) ? n.delete(gui) : n.add(gui);
      return n;
    });
  }, []);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const weeks = useMemo(
    () => [...new Set(rows.map((r) => r.week_key))].sort(),
    [rows]
  );

  // employee → engagement → rows
  const tree = useMemo(() => {
    const m = new Map<string, Map<string, DetailRow[]>>();
    for (const r of rows) {
      if (!m.has(r.employee_gui)) m.set(r.employee_gui, new Map());
      const em = m.get(r.employee_gui)!;
      if (!em.has(r.engagement_id)) em.set(r.engagement_id, []);
      em.get(r.engagement_id)!.push(r);
    }
    return m;
  }, [rows]);

  const empWeekTot = useMemo(() => {
    const m = new Map<string, { h: number; a: number }>();
    for (const r of rows) {
      const k = `${r.employee_gui}|${r.week_key}`;
      const c = m.get(k) ?? { h: 0, a: 0 };
      m.set(k, { h: c.h + r.charged_hours, a: c.a + r.ansr_revenue });
    }
    return m;
  }, [rows]);

  const engWeekTot = useMemo(() => {
    const m = new Map<string, { h: number; a: number }>();
    for (const r of rows) {
      const k = `${r.employee_gui}|${r.engagement_id}|${r.week_key}`;
      const c = m.get(k) ?? { h: 0, a: 0 };
      m.set(k, { h: c.h + r.charged_hours, a: c.a + r.ansr_revenue });
    }
    return m;
  }, [rows]);

  // key: empGui|engId|act|wk → single DetailRow
  const actWeekData = useMemo(() => {
    const m = new Map<string, DetailRow>();
    for (const r of rows) {
      m.set(`${r.employee_gui}|${r.engagement_id}|${r.activity_code ?? ""}|${r.week_key}`, r);
    }
    return m;
  }, [rows]);

  const empTot = useMemo(() => {
    const m = new Map<string, { h: number; a: number }>();
    for (const r of rows) {
      const c = m.get(r.employee_gui) ?? { h: 0, a: 0 };
      m.set(r.employee_gui, { h: c.h + r.charged_hours, a: c.a + r.ansr_revenue });
    }
    return m;
  }, [rows]);

  const engTot = useMemo(() => {
    const m = new Map<string, { h: number; a: number }>();
    for (const r of rows) {
      const k = `${r.employee_gui}|${r.engagement_id}`;
      const c = m.get(k) ?? { h: 0, a: 0 };
      m.set(k, { h: c.h + r.charged_hours, a: c.a + r.ansr_revenue });
    }
    return m;
  }, [rows]);

  const actTot = useMemo(() => {
    const m = new Map<string, { h: number; a: number }>();
    for (const r of rows) {
      const k = `${r.employee_gui}|${r.engagement_id}|${r.activity_code ?? ""}`;
      const c = m.get(k) ?? { h: 0, a: 0 };
      m.set(k, { h: c.h + r.charged_hours, a: c.a + r.ansr_revenue });
    }
    return m;
  }, [rows]);

  // Flat list of table rows (for clean render without nested maps)
  const flatRows = useMemo<FlatRow[]>(() => {
    const result: FlatRow[] = [];
    for (const [empGui, engMap] of tree) {
      const empName =
        rows.find((r) => r.employee_gui === empGui)?.employee_name ?? empGui;
      result.push({ kind: "employee", empGui, empName });
      for (const [engId, dRows] of engMap) {
        const engName = dRows[0]?.engagement_name ?? engId;
        const acts = [...new Set(dRows.map((r) => r.activity_code ?? ""))];
        const hasBreakdown = acts.length > 1;
        result.push({ kind: "engagement", empGui, engId, engName, hasBreakdown });
        if (hasBreakdown) {
          for (const act of acts) {
            result.push({ kind: "activity", empGui, engId, act });
          }
        }
      }
    }
    return result;
  }, [tree, rows]);

  const selectedNames = employees
    .filter((e) => selected.has(e.employee_gui))
    .map((e) => e.employee_name ?? e.employee_gui);

  if (employees.length === 0) return null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="w-full max-w-7xl space-y-4">
      {/* Header + multi-select */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Imputaciones por empleado</h2>

        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setDropOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span>
              {selected.size === 0
                ? "Seleccionar empleados…"
                : `${selected.size} empleado${selected.size > 1 ? "s" : ""}: ${selectedNames.slice(0, 2).join(", ")}${selectedNames.length > 2 ? "…" : ""}`}
            </span>
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${dropOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {dropOpen && (
            <div className="absolute z-20 mt-1 max-h-72 w-80 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl text-sm">
              <div className="sticky top-0 flex gap-3 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setSelected(new Set(employees.map((e) => e.employee_gui)))}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Todos
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-gray-400 hover:underline"
                >
                  Ninguno
                </button>
              </div>
              {employees.map((e) => (
                <label
                  key={e.employee_gui}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(e.employee_gui)}
                    onChange={() => toggleEmp(e.employee_gui)}
                    className="accent-blue-500 shrink-0"
                  />
                  <span className="truncate flex-1">
                    {e.employee_name ?? e.employee_gui}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">
                    {e.employee_gui}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        )}
      </div>

      {/* Pivot table */}
      {weeks.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="text-xs border-collapse min-w-max">
            <thead>
              {/* Week headers */}
              <tr className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                <th className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-800 px-4 py-2 text-left font-semibold min-w-[300px] border-r border-b border-gray-200 dark:border-gray-700">
                  Empleado / Engagement
                </th>
                {weeks.map((wk) => (
                  <th
                    key={wk}
                    colSpan={2}
                    className="px-3 py-2 text-center font-medium border-l border-b border-gray-200 dark:border-gray-700 whitespace-nowrap"
                  >
                    {fmtWeek(wk)}
                  </th>
                ))}
                <th
                  colSpan={2}
                  className="px-3 py-2 text-center font-semibold border-l border-b border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-700 whitespace-nowrap"
                >
                  Total
                </th>
              </tr>
              {/* h / ANSR sub-headers */}
              <tr className="bg-gray-50 dark:bg-gray-900 text-gray-400">
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700" />
                {weeks.map((wk) => (
                  <React.Fragment key={wk}>
                    <th className="px-2 py-1 text-right font-normal border-l border-b border-gray-200 dark:border-gray-700 w-16">
                      h
                    </th>
                    <th className="px-2 py-1 text-right font-normal border-b border-gray-200 dark:border-gray-700 w-24">
                      ANSR
                    </th>
                  </React.Fragment>
                ))}
                <th className="px-2 py-1 text-right font-normal border-l border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 w-16">
                  h
                </th>
                <th className="px-2 py-1 text-right font-normal border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 w-24">
                  ANSR
                </th>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((row) => {
                /* ── Employee total row ── */
                if (row.kind === "employee") {
                  const tot = empTot.get(row.empGui);
                  return (
                    <tr
                      key={`emp-${row.empGui}`}
                      className="bg-blue-50 dark:bg-blue-950/30 border-t-2 border-blue-200 dark:border-blue-800 font-semibold"
                    >
                      <td className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/30 px-4 py-2 border-r border-blue-100 dark:border-blue-900">
                        <span className="text-blue-800 dark:text-blue-300">
                          {row.empName}
                        </span>
                        <span className="ml-2 text-[10px] font-mono font-normal text-blue-400">
                          {row.empGui}
                        </span>
                      </td>
                      {weeks.map((wk) => {
                        const t = empWeekTot.get(`${row.empGui}|${wk}`);
                        return (
                          <React.Fragment key={wk}>
                            <td className="px-2 py-2 text-right tabular-nums border-l border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-400">
                              {t ? fmtH.format(t.h) : ""}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-blue-600 dark:text-blue-500">
                              {t ? fmtEur.format(t.a) : ""}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="px-2 py-2 text-right tabular-nums border-l border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                        {tot ? fmtH.format(tot.h) : ""}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                        {tot ? fmtEur.format(tot.a) : ""}
                      </td>
                    </tr>
                  );
                }

                /* ── Engagement subtotal row ── */
                if (row.kind === "engagement") {
                  const tot = engTot.get(`${row.empGui}|${row.engId}`);
                  return (
                    <tr
                      key={`eng-${row.empGui}-${row.engId}`}
                      className="bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-700"
                    >
                      <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/40 px-4 py-1.5 pl-8 border-r border-gray-200 dark:border-gray-700">
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {row.engName}
                        </span>
                        <span className="ml-2 text-[10px] font-mono text-gray-400">
                          {row.engId}
                        </span>
                      </td>
                      {weeks.map((wk) => {
                        const t = engWeekTot.get(`${row.empGui}|${row.engId}|${wk}`);
                        return (
                          <React.Fragment key={wk}>
                            <td className="px-2 py-1.5 text-right tabular-nums border-l border-gray-200 dark:border-gray-700 font-medium">
                              {t ? fmtH.format(t.h) : ""}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-medium text-gray-600 dark:text-gray-400">
                              {t ? fmtEur.format(t.a) : ""}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right tabular-nums border-l border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 font-semibold">
                        {tot ? fmtH.format(tot.h) : ""}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums bg-gray-100 dark:bg-gray-800 font-semibold text-gray-600 dark:text-gray-400">
                        {tot ? fmtEur.format(tot.a) : ""}
                      </td>
                    </tr>
                  );
                }

                /* ── Activity detail row ── */
                const tot = actTot.get(`${row.empGui}|${row.engId}|${row.act}`);
                return (
                  <tr
                    key={`act-${row.empGui}-${row.engId}-${row.act}`}
                    className="border-t border-gray-100 dark:border-gray-800/50"
                  >
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-1 pl-14 border-r border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400">
                      {row.act || <span className="italic text-gray-400">sin actividad</span>}
                    </td>
                    {weeks.map((wk) => {
                      const d = actWeekData.get(
                        `${row.empGui}|${row.engId}|${row.act}|${wk}`
                      );
                      return (
                        <React.Fragment key={wk}>
                          <td className="px-2 py-1 text-right tabular-nums border-l border-gray-100 dark:border-gray-800 text-gray-500">
                            {d ? fmtH.format(d.charged_hours) : ""}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-gray-400">
                            {d ? fmtEur.format(d.ansr_revenue) : ""}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-2 py-1 text-right tabular-nums border-l border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 text-gray-500">
                      {tot ? fmtH.format(tot.h) : ""}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums bg-gray-50 dark:bg-gray-800/30 text-gray-400">
                      {tot ? fmtEur.format(tot.a) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected.size > 0 && !loading && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          No hay imputaciones para los empleados seleccionados.
        </p>
      )}
    </section>
  );
}
