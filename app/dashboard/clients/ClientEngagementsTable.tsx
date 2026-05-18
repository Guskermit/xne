"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BudgetCell from "../BudgetCell";
import StatusCell from "../StatusCell";
import ScrollCell from "../ScrollCell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EngagementRow = {
  engagement_id: string;
  engagement_name: string;
  project_name: string;
  horas: number;
  nsr: number;
  ansr: number;
  coste_margen: number;
  margen_bruto: number;
  gasto_total: number;
  ter: number;
  budget: number | null;
  status: string;
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

function pct(ansr: number, margin: number): string {
  if (!ansr) return "—";
  return `${((margin / ansr) * 100).toFixed(1)} %`;
}

function pctColor(ansr: number, margin: number): string {
  if (!ansr) return "text-gray-400";
  const p = (margin / ansr) * 100;
  if (p >= 20) return "text-green-600 dark:text-green-400";
  if (p >= 0) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function remainingColor(v: number): string {
  if (v > 0) return "text-green-600 dark:text-green-400";
  if (v === 0) return "text-gray-500";
  return "text-red-600 dark:text-red-400";
}

function pctConsumed(ter: number, budget: number | null): string {
  if (!budget) return "—";
  return `${((ter / budget) * 100).toFixed(1)} %`;
}

function pctConsumedColor(ter: number, budget: number | null): string {
  if (!budget) return "text-gray-400";
  const p = (ter / budget) * 100;
  if (p <= 80) return "text-green-600 dark:text-green-400";
  if (p <= 100) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ClientEngagementsTable({
  clientId,
  fiscalYear,
}: {
  clientId: string;
  fiscalYear?: number | null;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = { p_client_id: clientId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase
      .rpc("get_client_engagement_kpis", params)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows((data as EngagementRow[]) ?? []);
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, fiscalYear]);

  // Summary totals
  const totalHoras  = rows.reduce((s, r) => s + r.horas, 0);
  const totalNsr    = rows.reduce((s, r) => s + r.nsr, 0);
  const totalAnsr   = rows.reduce((s, r) => s + r.ansr, 0);
  const totalCoste  = rows.reduce((s, r) => s + r.coste_margen, 0);
  const totalMargen = rows.reduce((s, r) => s + r.margen_bruto, 0);
  const totalGastos = rows.reduce((s, r) => s + r.gasto_total, 0);
  const totalTer    = rows.reduce((s, r) => s + r.ter, 0);
  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0) || null;

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-3">
        <h2 className="text-lg font-semibold">Engagements del cliente</h2>
        <div className="h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </section>
    );
  }

  if (!clientId) return null;

  if (error) {
    return (
      <section className="w-full max-w-7xl">
        <h2 className="text-lg font-semibold mb-3">Engagements del cliente</h2>
        <p className="text-sm text-red-500">Error: {error}</p>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="w-full max-w-7xl">
        <h2 className="text-lg font-semibold mb-3">Engagements del cliente</h2>
        <p className="text-sm text-gray-400 italic">Sin datos para el cliente seleccionado.</p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl space-y-3">
      <h2 className="text-lg font-semibold">Engagements del cliente</h2>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 whitespace-nowrap">Engagement</th>
              <th className="px-4 py-3 whitespace-nowrap">Proyecto</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">Estado</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Horas</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">NSR</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">ANSR</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Coste</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Margen</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">% Margen</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Gastos</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">TER</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Presupuesto</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Restante</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">% Consumido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => {
              const remaining = r.budget != null ? r.budget - r.ter : null;
              return (
                <tr
                  key={r.engagement_id}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                    r.status === "cerrado" ? "opacity-60" : ""
                  }`}
                >
                  <ScrollCell text={r.engagement_name} className="font-medium text-gray-900 dark:text-gray-100 max-w-[200px]" />
                  <ScrollCell text={r.project_name} className="text-gray-500 dark:text-gray-400 max-w-[160px]" />
                  <StatusCell
                    engagementId={r.engagement_id}
                    initialStatus={r.status}
                  />
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {hrs.format(r.horas)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {eur.format(r.nsr)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {eur.format(r.ansr)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {eur.format(r.coste_margen)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${pctColor(r.ansr, r.margen_bruto)}`}>
                    {eur.format(r.margen_bruto)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${pctColor(r.ansr, r.margen_bruto)}`}>
                    {pct(r.ansr, r.margen_bruto)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {eur.format(r.gasto_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {eur.format(r.ter)}
                  </td>
                  <BudgetCell
                    engagementId={r.engagement_id}
                    initialBudget={r.budget}
                  />
                  <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${
                    remaining != null ? remainingColor(remaining) : "text-gray-400"
                  }`}>
                    {remaining != null ? eur.format(remaining) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${pctConsumedColor(r.ter, r.budget)}`}>
                    {pctConsumed(r.ter, r.budget)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100 text-sm">
              <td className="px-4 py-3" colSpan={3}>Total ({rows.length} engagements)</td>
              <td className="px-4 py-3 text-right tabular-nums">{hrs.format(totalHoras)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalNsr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalAnsr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalCoste)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctColor(totalAnsr, totalMargen)}`}>
                {eur.format(totalMargen)}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctColor(totalAnsr, totalMargen)}`}>
                {pct(totalAnsr, totalMargen)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalGastos)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalTer)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                {totalBudget ? eur.format(totalBudget) : "—"}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${
                totalBudget ? remainingColor(totalBudget - totalTer) : "text-gray-400"
              }`}>
                {totalBudget ? eur.format(totalBudget - totalTer) : "—"}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctConsumedColor(totalTer, totalBudget)}`}>
                {pctConsumed(totalTer, totalBudget)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
