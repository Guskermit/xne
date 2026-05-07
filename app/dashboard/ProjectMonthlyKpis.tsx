"use client";

import { useEffect, useState } from "react";
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

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const hrs = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

function fmtMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
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

  // Load monthly KPIs when selection or FY changes
  useEffect(() => {
    if (!selectedId) { setRows([]); return; }
    setLoadingData(true);
    setError(null);
    const params: Record<string, unknown> = { p_engagement_id: selectedId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase
      .rpc("get_project_monthly_kpis", params)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows((data as MonthlyKpi[]) ?? []);
        }
        setLoadingData(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, fiscalYear]);

  // ---------------------------------------------------------------------------
  // Totals
  // ---------------------------------------------------------------------------
  const totalHoras  = rows.reduce((s, r) => s + r.horas, 0);
  const totalNsr    = rows.reduce((s, r) => s + r.nsr, 0);
  const totalAnsr   = rows.reduce((s, r) => s + r.ansr, 0);
  const totalCoste  = rows.reduce((s, r) => s + r.coste_margen, 0);
  const totalMargen = rows.reduce((s, r) => s + r.margen_bruto, 0);
  const totalGastos = rows.reduce((s, r) => s + r.gasto_total, 0);
  const totalTer    = rows.reduce((s, r) => s + r.ter, 0);

  // Accumulated at each row
  let accHoras  = 0;
  let accAnsr   = 0;
  let accGastos = 0;
  let accTer    = 0;

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

  const selected = engagements.find((e) => e.engagement_id === selectedId);

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
              {rows.map((r) => {
                accHoras  += r.horas;
                accAnsr   += r.ansr;
                accGastos += r.gasto_total;
                accTer    += r.ter;
                return (
                  <tr
                    key={r.mes}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
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
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100">
                <td className="px-4 py-3">Total</td>
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
            </tfoot>
          </table>
        </div>
      )}

      {!loadingData && rows.length === 0 && !error && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No hay datos para este engagement.
        </p>
      )}
    </section>
  );
}
