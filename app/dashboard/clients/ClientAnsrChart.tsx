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
  engagement_id: string;
  engagement_name: string;
  ansr: number;
};

// ---------------------------------------------------------------------------
// Colour palette – cycles if there are more engagements than colours
// ---------------------------------------------------------------------------
const COLOURS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#ec4899", // pink-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
  "#a855f7", // purple-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#0ea5e9", // sky-500
  "#f43f5e", // rose-500
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
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-xs space-y-1 max-w-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">
        {label ? fmtMonth(label) : ""}
      </p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-gray-600 dark:text-gray-300 truncate max-w-[160px]" title={p.name}>
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
export default function ClientAnsrChart({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear = fyStr ? parseInt(fyStr, 10) : null;

  const [raw, setRaw] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) { setRaw([]); return; }
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = { p_client_id: clientId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase
      .rpc("get_client_engagement_monthly_ansr", params)
      .then(({ data, error }) => {
        if (error) { setError(error.message); setRaw([]); }
        else setRaw((data as RawRow[]) ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, fiscalYear]);

  // ── Transform raw rows into recharts format ──────────────────────────────
  const { months, engagements, chartData } = useMemo(() => {
    // Collect ordered unique months and engagement IDs
    const monthSet = new Set<string>();
    const engMap = new Map<string, string>(); // id → name
    for (const r of raw) {
      monthSet.add(r.mes);
      if (!engMap.has(r.engagement_id)) engMap.set(r.engagement_id, r.engagement_name);
    }
    const months = [...monthSet].sort();
    const engagements = [...engMap.entries()].map(([id, name]) => ({ id, name }));

    // Build one data point per month
    const lookup = new Map<string, Map<string, number>>();
    for (const r of raw) {
      if (!lookup.has(r.mes)) lookup.set(r.mes, new Map());
      lookup.get(r.mes)!.set(r.engagement_id, r.ansr);
    }
    const chartData = months.map((mes) => {
      const entry: Record<string, string | number> = { mes };
      const monthData = lookup.get(mes) ?? new Map();
      for (const eng of engagements) {
        entry[eng.id] = monthData.get(eng.id) ?? 0;
      }
      return entry;
    });

    return { months, engagements, chartData };
  }, [raw]);

  if (loading) {
    return (
      <section className="w-full max-w-7xl space-y-3">
        <h2 className="text-lg font-semibold">ANSR mensual por engagement</h2>
        <div className="h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="w-full max-w-7xl">
        <h2 className="text-lg font-semibold mb-2">ANSR mensual por engagement</h2>
        <p className="text-sm text-red-500">Error: {error}</p>
      </section>
    );
  }

  if (!clientId || chartData.length === 0) return null;

  return (
    <section className="w-full max-w-7xl space-y-3">
      <h2 className="text-lg font-semibold">ANSR mensual por engagement</h2>

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
                const eng = engagements.find((e) => e.id === value);
                return (
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {eng?.name ?? value}
                  </span>
                );
              }}
              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            />
            {engagements.map((eng, i) => (
              <Bar
                key={eng.id}
                dataKey={eng.id}
                name={eng.name}
                stackId="ansr"
                fill={colourFor(i)}
                radius={i === engagements.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
