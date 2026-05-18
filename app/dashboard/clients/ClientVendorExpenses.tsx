"use client";

import { useEffect, useState, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type VendorRow = {
  vendor_id: string;
  vendor_name: string;
  transaction_type_code: string;
  category_description: string;
  total_gasto: number;
  n_lineas: number;
};

type InvoiceLine = {
  engagement_name: string;
  vendor_name: string;
  transaction_type_code: string;
  category_description: string;
  expense_description: string | null;
  transaction_date: string | null;
  accounting_date: string | null;
  expense_amount: number;
  voucher_id: string | null;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurInt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Row key to identify a vendor+type+category group
// ---------------------------------------------------------------------------
function rowKey(r: VendorRow): string {
  return `${r.vendor_id}||${r.transaction_type_code}||${r.category_description}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ClientVendorExpenses({
  clientId,
  fiscalYear,
}: {
  clientId: string;
  fiscalYear?: number | null;
}) {
  const supabase = createClient();

  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map of rowKey → invoice lines (loaded on demand)
  const [invoices, setInvoices] = useState<Map<string, InvoiceLine[]>>(new Map());
  const [loadingInvoices, setLoadingInvoices] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load vendor summary
  useEffect(() => {
    if (!clientId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    setInvoices(new Map());
    const params: Record<string, unknown> = { p_client_id: clientId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase
      .rpc("get_client_expenses_by_vendor", params)
      .then(({ data, error }) => {
        if (error) { setError(error.message); setRows([]); }
        else setRows((data as VendorRow[]) ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, fiscalYear]);

  // Toggle expand + lazy-load invoice lines
  function toggleRow(r: VendorRow) {
    const key = rowKey(r);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      next.add(key);
      // Load invoices if not already cached
      if (!invoices.has(key)) {
        setLoadingInvoices((s) => new Set(s).add(key));
        const params: Record<string, unknown> = {
          p_client_id: clientId,
          p_vendor_id: r.vendor_id,
          p_transaction_type_code: r.transaction_type_code,
          p_category_description: r.category_description,
        };
        if (fiscalYear) params.p_fiscal_year = fiscalYear;
        supabase
          .rpc("get_client_expense_lines", params)
          .then(({ data, error }) => {
            if (!error) {
              setInvoices((prev) => new Map(prev).set(key, (data as InvoiceLine[]) ?? []));
            }
            setLoadingInvoices((s) => {
              const next = new Set(s);
              next.delete(key);
              return next;
            });
          });
      }
      return next;
    });
  }

  // Totals
  const totalGasto = rows.reduce((s, r) => s + r.total_gasto, 0);
  const totalLineas = rows.reduce((s, r) => s + Number(r.n_lineas), 0);

  function barWidth(gasto: number): string {
    if (!totalGasto) return "0%";
    return `${Math.abs((gasto / totalGasto) * 100).toFixed(1)}%`;
  }

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-3">
        <h2 className="text-lg font-semibold">Gastos por proveedor</h2>
        <div className="h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </section>
    );
  }

  if (!clientId || rows.length === 0) return null;

  if (error) {
    return (
      <section className="w-full max-w-7xl">
        <h2 className="text-lg font-semibold mb-3">Gastos por proveedor</h2>
        <p className="text-sm text-red-500">Error: {error}</p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-7xl space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Gastos por proveedor</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Haz clic en una fila para ver el detalle de facturas
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3 whitespace-nowrap">Proveedor</th>
              <th className="px-4 py-3 whitespace-nowrap">Tipo</th>
              <th className="px-4 py-3 whitespace-nowrap">Categoría</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Importe</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">% Total</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Líneas</th>
              <th className="px-4 py-3 whitespace-nowrap min-w-[120px]">Distribución</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => {
              const key = rowKey(r);
              const isExpanded = expanded.has(key);
              const isLoadingLines = loadingInvoices.has(key);
              const lines = invoices.get(key) ?? [];
              const pctVal = totalGasto ? (r.total_gasto / totalGasto) * 100 : 0;

              return (
                <Fragment key={key}>
                  {/* Summary row */}
                  <tr
                    key={key}
                    onClick={() => toggleRow(r)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-2 py-3 text-center text-gray-400">
                      <span className="text-xs select-none">{isExpanded ? "▾" : "▸"}</span>
                    </td>
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
                      {eur.format(r.total_gasto)}
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

                  {/* Invoice lines (expanded) */}
                  {isExpanded && (
                    <tr key={`${key}-lines`}>
                      <td colSpan={8} className="px-0 py-0 bg-blue-50/40 dark:bg-blue-950/20">
                        {isLoadingLines ? (
                          <div className="px-8 py-4">
                            <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                          </div>
                        ) : lines.length === 0 ? (
                          <p className="px-8 py-3 text-xs text-gray-400 italic">Sin facturas registradas.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-blue-100 dark:border-blue-900 text-left text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                                  <th className="pl-12 pr-4 py-2 whitespace-nowrap">Engagement</th>
                                  <th className="px-4 py-2 whitespace-nowrap">Descripción</th>
                                  <th className="px-4 py-2 whitespace-nowrap">F. Transacción</th>
                                  <th className="px-4 py-2 whitespace-nowrap">F. Contable</th>
                                  <th className="px-4 py-2 text-right whitespace-nowrap">Importe</th>
                                  <th className="px-4 py-2 whitespace-nowrap">Voucher</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-blue-100/60 dark:divide-blue-900/40">
                                {lines.map((l, i) => (
                                  <tr key={i} className="hover:bg-blue-50 dark:hover:bg-blue-950/30">
                                    <td className="pl-12 pr-4 py-2 text-gray-700 dark:text-gray-300 max-w-[180px] truncate" title={l.engagement_name}>
                                      {l.engagement_name}
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 max-w-[220px] truncate" title={l.expense_description ?? ""}>
                                      {l.expense_description ?? "—"}
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                      {fmtDate(l.transaction_date)}
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                      {fmtDate(l.accounting_date)}
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                      {eur.format(l.expense_amount)}
                                    </td>
                                    <td className="px-4 py-2 text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
                                      {l.voucher_id ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-blue-200 dark:border-blue-800 font-semibold text-gray-700 dark:text-gray-300">
                                  <td className="pl-12 pr-4 py-2" colSpan={4}>
                                    Subtotal ({lines.length} líneas)
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {eur.format(lines.reduce((s, l) => s + l.expense_amount, 0))}
                                  </td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100">
              <td className="px-2 py-3" />
              <td className="px-4 py-3" colSpan={3}>Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalGasto)}</td>
              <td className="px-4 py-3 text-right tabular-nums">100 %</td>
              <td className="px-4 py-3 text-right tabular-nums">{totalLineas}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
