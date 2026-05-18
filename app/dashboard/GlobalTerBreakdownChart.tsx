"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RawRow = {
  mes: string;
  ansr: number;
  gastos: number;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function yTickFormatter(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M€`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)} k€`;
  return `${value} €`;
}

function fmtMonth(ym: string): string {
  const [year, month] = ym.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("es-ES", {
    month: "short",
    year: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
const SERIES = [
  { key: "ansr",   label: "ANSR",   colour: "#3b82f6" },
  { key: "gastos", label: "Gastos", colour: "#f59e0b" },
] as const;

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">
        {label ? fmtMonth(label) : ""}
      </p>
      {[...payload].reverse().map((p) => {
        const pct = total > 0 ? (p.value / total) * 100 : 0;
        return (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-gray-600 dark:text-gray-300">{p.name}</span>
            <span className="ml-auto tabular-nums font-medium text-gray-900 dark:text-gray-100 pl-4 whitespace-nowrap">
              {eur.format(p.value)}{" "}
              <span className="text-gray-400 dark:text-gray-500 font-normal">
                ({pct.toFixed(1)} %)
              </span>
            </span>
          </div>
        );
      })}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-1 mt-1 flex justify-between font-semibold text-gray-800 dark:text-gray-200">
        <span>TER total</span>
        <span className="tabular-nums">{eur.format(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobalTerBreakdownChart() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear   = fyStr ? parseInt(fyStr, 10) : null;
  const businessUnit = searchParams.get("bu");

  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params: Record<string, unknown> = {};
    if (fiscalYear !== null) params.p_fiscal_year = fiscalYear;
    if (businessUnit) params.p_business_unit = businessUnit;

    supabase
      .rpc("get_global_monthly_ter_breakdown", params)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setRows([]); }
        else setRows((data as RawRow[]) ?? []);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, businessUnit]);

  if (loading)
    return (
      <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
    );
  if (error)
    return (
      <p className="text-red-500 text-sm">Error cargando TER mensual: {error}</p>
    );
  if (rows.length === 0) return null;

  return (
    <section className="w-full max-w-7xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Evolución mensual del TER (ANSR + Gastos)
      </h2>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
          <XAxis
            dataKey="mes"
            tickFormatter={fmtMonth}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={yTickFormatter}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.04 }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="ansr"   name="ANSR"   stackId="ter" fill="#3b82f6" />
          <Bar dataKey="gastos" name="Gastos" stackId="ter" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
