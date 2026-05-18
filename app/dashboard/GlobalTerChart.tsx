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
  client_id: string;
  client_name: string;
  color: string | null;
  ter: number;
};

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const COLOURS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
  "#14b8a6", "#a855f7", "#eab308", "#22c55e", "#0ea5e9", "#f43f5e",
];

function colourFor(i: number): string {
  return COLOURS[i % COLOURS.length];
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

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
        <span>Total TER</span>
        <span className="tabular-nums">{eur.format(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobalTerChart() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear   = fyStr ? parseInt(fyStr, 10) : null;
  const businessUnit = searchParams.get("bu");

  const [raw, setRaw] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = {};
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    if (businessUnit) params.p_business_unit = businessUnit;
    supabase
      .rpc("get_global_monthly_ter_by_client", params)
      .then(({ data, error }) => {
        if (error) { setError(error.message); setRaw([]); }
        else setRaw((data as RawRow[]) ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, businessUnit]);

  // ── Build recharts data ───────────────────────────────────────────────────
  const { months, clients, chartData } = useMemo(() => {
    const monthSet = new Set<string>();
    const clientMap = new Map<string, string>(); // id → name
    for (const r of raw) {
      monthSet.add(r.mes);
      if (!clientMap.has(r.client_id)) clientMap.set(r.client_id, r.client_name);
    }
    const months = [...monthSet].sort();
    // Build a map of client_id → color from raw data
    const colorMap = new Map<string, string | null>();
    for (const r of raw) colorMap.set(r.client_id, r.color ?? null);
    const clients = [...clientMap.entries()].map(([id, name], i) => ({
      id,
      name,
      colour: colorMap.get(id) ?? COLOURS[i % COLOURS.length],
    }));

    const lookup = new Map<string, Map<string, number>>();
    for (const r of raw) {
      if (!lookup.has(r.mes)) lookup.set(r.mes, new Map());
      lookup.get(r.mes)!.set(r.client_id, r.ter);
    }

    const chartData = months.map((mes) => {
      const entry: Record<string, string | number> = { mes };
      const md = lookup.get(mes) ?? new Map();
      for (const c of clients) entry[c.id] = md.get(c.id) ?? 0;
      return entry;
    });

    return { months, clients, chartData };
  }, [raw]);

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-3">
        <h2 className="text-lg font-semibold">TER mensual por cliente</h2>
        <div className="h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="w-full max-w-7xl">
        <h2 className="text-lg font-semibold mb-2">TER mensual por cliente</h2>
        <p className="text-sm text-red-500">Error: {error}</p>
      </section>
    );
  }

  if (chartData.length === 0) return null;

  return (
    <section className="w-full max-w-7xl space-y-3">
      <div>
        <h2 className="text-lg font-semibold">TER mensual por cliente</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          ANSR + gastos acumulados por cliente y mes
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
            barCategoryGap="25%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="rgba(156,163,175,0.3)"
            />
            <XAxis
              dataKey="mes"
              tickFormatter={fmtMonth}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M €`
                  : v >= 1_000
                  ? `${(v / 1_000).toFixed(0)}k €`
                  : `${v} €`
              }
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(59,130,246,0.05)" }}
            />
            <Legend
              formatter={(value: string) => {
                const client = clients.find((c) => c.id === value);
                return (
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    {client?.name ?? value}
                  </span>
                );
              }}
              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            />
            {clients.map((c, i) => (
              <Bar
                key={c.id}
                dataKey={c.id}
                name={c.name}
                stackId="ter"
                fill={c.colour}
                radius={i === clients.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
