"use client";

import { useEffect, useMemo, useState } from "react";
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
  vendor_id: string;
  vendor_name: string;
  color: string | null;
  gasto_total: number;
};

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const COLOURS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
  "#14b8a6", "#a855f7", "#eab308", "#22c55e", "#0ea5e9", "#f43f5e",
];

function colourFor(index: number): string {
  return COLOURS[index % COLOURS.length];
}

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
  const visible = payload.filter((p) => p.value > 0);
  const total = visible.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-xs space-y-1 max-w-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">
        {label ? fmtMonth(label) : ""}
      </p>
      {[...visible].reverse().map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: p.color }}
          />
          <span
            className="text-gray-600 dark:text-gray-300 truncate max-w-[160px]"
            title={p.name}
          >
            {p.name}
          </span>
          <span className="ml-auto tabular-nums font-medium text-gray-900 dark:text-gray-100 pl-2 whitespace-nowrap">
            {eur.format(p.value)}
          </span>
        </div>
      ))}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-1 mt-1 flex justify-between font-semibold text-gray-800 dark:text-gray-200">
        <span>Total</span>
        <span className="tabular-nums">{eur.format(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobalVendorExpensesChart() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear   = fyStr ? parseInt(fyStr, 10) : null;
  const businessUnit = searchParams.get("bu");

  const [raw, setRaw] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params: Record<string, unknown> = {};
    if (fiscalYear !== null) params.p_fiscal_year = fiscalYear;
    if (businessUnit) params.p_business_unit = businessUnit;

    supabase
      .rpc("get_global_monthly_expenses_by_vendor", params)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setRaw([]); }
        else setRaw((data as RawRow[]) ?? []);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, businessUnit]);

  // Build chart data: [{ mes, VendorA: n, VendorB: n, … }, …]
  const { months, vendors, chartData } = useMemo(() => {
    const monthSet = new Set<string>();
    const vendorMap = new Map<string, { name: string; index: number }>();

    raw.forEach((r) => {
      monthSet.add(r.mes);
      if (!vendorMap.has(r.vendor_id)) {
        vendorMap.set(r.vendor_id, { name: r.vendor_name, index: vendorMap.size });
      }
    });

    const months = [...monthSet].sort();
    const vendors = [...vendorMap.entries()].map(([id, { name, index }]) => ({
      id,
      name,
      colour: raw.find((r) => r.vendor_id === id)?.color ?? colourFor(index),
    }));

    const byMonth = new Map<string, Record<string, number>>();
    months.forEach((m) => byMonth.set(m, {}));
    raw.forEach((r) => {
      const row = byMonth.get(r.mes)!;
      row[r.vendor_id] = (row[r.vendor_id] ?? 0) + r.gasto_total;
    });

    const chartData = months.map((m) => ({ mes: m, ...byMonth.get(m) }));
    return { months, vendors, chartData };
  }, [raw]);

  if (loading)
    return (
      <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
    );
  if (error)
    return (
      <p className="text-red-500 text-sm">Error cargando gastos globales: {error}</p>
    );
  if (chartData.length === 0) return null;

  return (
    <section className="w-full max-w-7xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Gastos globales por proveedor
      </h2>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
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
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {vendors.map((v, i) => (
            <Bar
              key={v.id}
              dataKey={v.id}
              name={v.name}
              stackId="gastos"
              fill={v.colour}
              radius={i === vendors.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
