"use client";

import { useState, useMemo } from "react";
import ScrollCell from "./ScrollCell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ClientKpi = {
  client_id: string;
  client_name: string;
  n_engagements: number;
  horas: number;
  nsr: number;
  ansr: number;
  coste_margen: number;
  margen_bruto: number;
  gasto_total: number;
  ter: number;
  budget: number | null;
};

type SortKey =
  | "client_name"
  | "n_engagements"
  | "horas"
  | "nsr"
  | "ansr"
  | "coste_margen"
  | "margen_bruto"
  | "pct_margen"
  | "gasto_total"
  | "ter"
  | "budget"
  | "remaining"
  | "pct_consumido";

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

function pctConsumed(t: number, budget: number | null): string {
  if (!budget) return "—";
  return `${((t / budget) * 100).toFixed(1)} %`;
}

function pctConsumedColor(t: number, budget: number | null): string {
  if (!budget) return "text-gray-400";
  const p = (t / budget) * 100;
  if (p <= 80) return "text-green-600 dark:text-green-400";
  if (p <= 100) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// SortHeader
// ---------------------------------------------------------------------------
function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  right,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey | null;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${right ? "text-right" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {!right && label}
        {active ? (
          <span className="text-blue-500">{dir === "asc" ? "↑" : "↓"}</span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">↕</span>
        )}
        {right && label}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ClientKpisTable({ rows }: { rows: ClientKpi[] }) {
  const [clientFilter, setClientFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("ansr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const cl = clientFilter.trim().toLowerCase();
    return rows.filter((r) => !cl || r.client_name.toLowerCase().includes(cl));
  }, [rows, clientFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "client_name":    av = a.client_name;    bv = b.client_name; break;
        case "n_engagements":  av = a.n_engagements;  bv = b.n_engagements; break;
        case "horas":          av = a.horas;          bv = b.horas; break;
        case "nsr":            av = a.nsr;            bv = b.nsr; break;
        case "ansr":           av = a.ansr;           bv = b.ansr; break;
        case "coste_margen":   av = a.coste_margen;   bv = b.coste_margen; break;
        case "margen_bruto":   av = a.margen_bruto;   bv = b.margen_bruto; break;
        case "pct_margen":     av = a.ansr ? a.margen_bruto / a.ansr : 0; bv = b.ansr ? b.margen_bruto / b.ansr : 0; break;
        case "gasto_total":    av = a.gasto_total;    bv = b.gasto_total; break;
        case "ter":            av = a.ter;            bv = b.ter; break;
        case "budget":         av = a.budget ?? -Infinity; bv = b.budget ?? -Infinity; break;
        case "remaining":      av = a.budget != null ? a.budget - a.ter : -Infinity; bv = b.budget != null ? b.budget - b.ter : -Infinity; break;
        case "pct_consumido":  av = a.budget ? a.ter / a.budget : Infinity; bv = b.budget ? b.ter / b.budget : Infinity; break;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [filtered, sortKey, sortDir]);

  // Totals over filtered+sorted rows
  const totalHoras   = sorted.reduce((s, r) => s + r.horas, 0);
  const totalNsr     = sorted.reduce((s, r) => s + r.nsr, 0);
  const totalAnsr    = sorted.reduce((s, r) => s + r.ansr, 0);
  const totalCoste   = sorted.reduce((s, r) => s + r.coste_margen, 0);
  const totalMargen  = sorted.reduce((s, r) => s + r.margen_bruto, 0);
  const totalGastos  = sorted.reduce((s, r) => s + r.gasto_total, 0);
  const totalTer     = sorted.reduce((s, r) => s + r.ter, 0);
  const totalBudget  = sorted.every((r) => r.budget != null)
    ? sorted.reduce((s, r) => s + (r.budget ?? 0), 0)
    : null;

  const sh = (key: SortKey, label: string, right = true) => (
    <SortHeader label={label} sortKey={key} current={sortKey} dir={sortDir} onSort={handleSort} right={right} />
  );

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Cliente:</label>
          <input
            type="text"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            placeholder="Filtrar…"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>
        {clientFilter && (
          <button
            onClick={() => setClientFilter("")}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕ Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {sorted.length} de {rows.length} clientes
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {sh("client_name", "Cliente", false)}
              {sh("n_engagements", "Engagements")}
              {sh("horas", "Horas")}
              {sh("nsr", "NSR")}
              {sh("ansr", "ANSR")}
              {sh("coste_margen", "Coste")}
              {sh("margen_bruto", "Margen bruto")}
              {sh("pct_margen", "% Margen")}
              {sh("gasto_total", "Gastos")}
              {sh("ter", "TER")}
              {sh("budget", "Presupuesto")}
              {sh("remaining", "Restante")}
              {sh("pct_consumido", "% Consumido")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.map((r) => (
              <tr key={r.client_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <ScrollCell text={r.client_name} className="font-medium text-gray-900 dark:text-gray-100 max-w-[200px]" />
                <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{r.n_engagements}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{hrs.format(r.horas)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{eur.format(r.nsr)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{eur.format(r.ansr)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{eur.format(r.coste_margen)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{eur.format(r.margen_bruto)}</td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pctColor(r.ansr, r.margen_bruto)}`}>{pct(r.ansr, r.margen_bruto)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">{r.gasto_total > 0 ? eur.format(r.gasto_total) : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">{eur.format(r.ter)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{r.budget != null ? eur.format(r.budget) : "—"}</td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${r.budget != null ? remainingColor(r.budget - r.ter) : "text-gray-300 dark:text-gray-600"}`}>
                  {r.budget != null ? eur.format(r.budget - r.ter) : "—"}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pctConsumedColor(r.ter, r.budget)}`}>
                  {pctConsumed(r.ter, r.budget)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100">
              <td className="px-4 py-3">Total ({sorted.length})</td>
              <td className="px-4 py-3 text-right tabular-nums">{sorted.reduce((s, r) => s + r.n_engagements, 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{hrs.format(totalHoras)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalNsr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalAnsr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalCoste)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalMargen)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctColor(totalAnsr, totalMargen)}`}>{pct(totalAnsr, totalMargen)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalGastos)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalTer)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totalBudget != null ? eur.format(totalBudget) : "—"}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${totalBudget != null ? remainingColor(totalBudget - totalTer) : "text-gray-400"}`}>
                {totalBudget != null ? eur.format(totalBudget - totalTer) : "—"}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctConsumedColor(totalTer, totalBudget)}`}>
                {pctConsumed(totalTer, totalBudget)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
