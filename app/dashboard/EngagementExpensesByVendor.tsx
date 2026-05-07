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
  gasto_total: number;
};

type VendorExpense = {
  vendor_id: string;
  vendor_name: string;
  transaction_type_code: string;
  category_description: string;
  total_gasto: number;
  n_lineas: number;
};

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function EngagementExpensesByVendor() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear = fyStr ? parseInt(fyStr, 10) : null;

  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rows, setRows] = useState<VendorExpense[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload engagement list (with expenses) when FY changes
  useEffect(() => {
    setLoadingList(true);
    const params = fiscalYear ? { p_fiscal_year: fiscalYear } : {};
    supabase
      .rpc("get_engagement_kpis", params)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          const all = (data as EngagementOption[]) ?? [];
          const withExpenses = all.filter((e) => e.gasto_total > 0);
          setEngagements(withExpenses);
          setSelectedId(withExpenses.length > 0 ? withExpenses[0].engagement_id : "");
        }
        setLoadingList(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  // Load vendor breakdown when selection or FY changes
  useEffect(() => {
    if (!selectedId) { setRows([]); return; }
    setLoadingData(true);
    setError(null);
    const params: Record<string, unknown> = { p_engagement_id: selectedId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase
      .rpc("get_engagement_expenses_by_vendor", params)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows((data as VendorExpense[]) ?? []);
        }
        setLoadingData(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, fiscalYear]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const totalGasto = rows.reduce((s, r) => s + r.total_gasto, 0);
  const totalLineas = rows.reduce((s, r) => s + Number(r.n_lineas), 0);
  const selected = engagements.find((e) => e.engagement_id === selectedId);

  // Percentage bar width helper
  function barWidth(gasto: number): string {
    if (!totalGasto) return "0%";
    return `${Math.abs((gasto / totalGasto) * 100).toFixed(1)}%`;
  }

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
        <h2 className="text-lg font-semibold shrink-0">Gastos por vendor</h2>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full sm:max-w-lg rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {engagements.map((e) => (
            <option key={e.engagement_id} value={e.engagement_id}>
              {e.client_name} — {e.project_name} — {e.engagement_name} ({eur.format(e.gasto_total)})
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
          {" — "}Total gastos: <span className="font-medium">{eur.format(selected.gasto_total)}</span>
        </p>
      )}

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      {loadingData && (
        <div className="h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      )}

      {!loadingData && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 whitespace-nowrap">Vendor</th>
                <th className="px-4 py-3 whitespace-nowrap">Tipo</th>
                <th className="px-4 py-3 whitespace-nowrap">Categoría</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Importe</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">% Total</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Líneas</th>
                <th className="px-4 py-3 whitespace-nowrap min-w-[120px]">Distribución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r, i) => {
                const pctVal = totalGasto ? (r.total_gasto / totalGasto) * 100 : 0;
                return (
                  <tr
                    key={i}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 max-w-[200px] truncate" title={r.vendor_name}>
                      {r.vendor_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {r.transaction_type_code}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[160px] truncate" title={r.category_description}>
                      {r.category_description}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {eurDec.format(r.total_gasto)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {pctVal.toFixed(1)} %
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {r.n_lineas}
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-400 dark:bg-blue-500"
                          style={{ width: barWidth(r.total_gasto) }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100">
                <td className="px-4 py-3" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{eurDec.format(totalGasto)}</td>
                <td className="px-4 py-3 text-right tabular-nums">100 %</td>
                <td className="px-4 py-3 text-right tabular-nums">{totalLineas}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loadingData && rows.length === 0 && !error && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No hay gastos para este engagement.
        </p>
      )}
    </section>
  );
}
