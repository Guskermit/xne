"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RawRow = {
  quarter: string;
  quarter_sort: string;
  client_id: string;
  client_name: string;
  color: string | null;
  ansr: number;
  gastos: number;
};

type KeyMeta = Map<string, { name: string; type: "ansr" | "gastos"; colour: string }>;

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const COLOURS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
  "#14b8a6", "#a855f7", "#eab308", "#22c55e", "#0ea5e9", "#f43f5e",
];

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

// ---------------------------------------------------------------------------
// Custom legend
// ---------------------------------------------------------------------------
function QuarterlyLegend({
  clients,
}: {
  clients: { id: string; name: string; colour: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 justify-center pt-4 text-xs">
      {clients.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <span className="flex gap-[2px]">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: c.colour }}
            />
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: c.colour, opacity: 0.4 }}
            />
          </span>
          <span className="text-gray-600 dark:text-gray-300">{c.name}</span>
        </div>
      ))}
      <div className="basis-full flex justify-center gap-6 text-[10px] text-gray-400 dark:text-gray-500 mt-1">
        <span>■ sólido = ANSR</span>
        <span>■ semitransparente = Gastos</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
function ChartTooltip({
  active,
  payload,
  label,
  keyMeta,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  keyMeta: KeyMeta;
}) {
  if (!active || !payload?.length) return null;

  // Group by client
  const byClient = new Map<
    string,
    { name: string; colour: string; ansr: number; gastos: number }
  >();
  payload.forEach((p) => {
    const meta = keyMeta.get(p.dataKey);
    if (!meta || (p.value ?? 0) === 0) return;
    if (!byClient.has(meta.name)) {
      byClient.set(meta.name, { name: meta.name, colour: meta.colour, ansr: 0, gastos: 0 });
    }
    byClient.get(meta.name)![meta.type] += p.value ?? 0;
  });

  const entries = [...byClient.values()];
  if (entries.length === 0) return null;
  const grandTotal = entries.reduce((s, e) => s + e.ansr + e.gastos, 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-xs space-y-2 max-w-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      {entries.map((e) => {
        const ter = e.ansr + e.gastos;
        return (
          <div key={e.name} className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: e.colour }}
              />
              <span className="truncate max-w-[140px]" title={e.name}>
                {e.name}
              </span>
              <span className="ml-auto tabular-nums pl-2">{eur.format(ter)}</span>
            </div>
            <div className="pl-4 flex justify-between text-gray-500 dark:text-gray-400">
              <span>ANSR</span>
              <span className="tabular-nums">{eur.format(e.ansr)}</span>
            </div>
            <div className="pl-4 flex justify-between text-gray-500 dark:text-gray-400">
              <span>Gastos</span>
              <span className="tabular-nums">{eur.format(e.gastos)}</span>
            </div>
          </div>
        );
      })}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-1 flex justify-between font-semibold text-gray-800 dark:text-gray-200">
        <span>TER total</span>
        <span className="tabular-nums">{eur.format(grandTotal)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobalQuarterlyTerChart() {
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
      .rpc("get_global_quarterly_ter_by_client", params)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setRaw([]); }
        else setRaw((data as RawRow[]) ?? []);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, businessUnit]);

  const { clients, chartData, keyMeta } = useMemo(() => {
    const quarterMap = new Map<string, string>(); // sort → label
    const clientMap = new Map<string, { name: string; color: string | null; index: number }>();

    raw.forEach((r) => {
      quarterMap.set(r.quarter_sort, r.quarter);
      if (!clientMap.has(r.client_id)) {
        clientMap.set(r.client_id, { name: r.client_name, color: r.color ?? null, index: clientMap.size });
      }
    });

    const sortedQuarters = [...quarterMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const clients = [...clientMap.entries()].map(([id, { name, color, index }]) => ({
      id,
      name,
      colour: color ?? COLOURS[index % COLOURS.length],
      ansrKey: `c${index}_a`,
      gastosKey: `c${index}_g`,
    }));

    const keyMeta: KeyMeta = new Map();
    clients.forEach((c) => {
      keyMeta.set(c.ansrKey,   { name: c.name, type: "ansr",   colour: c.colour });
      keyMeta.set(c.gastosKey, { name: c.name, type: "gastos", colour: c.colour });
    });

    // Build chartData: one row per quarter
    const dataMap = new Map<string, Record<string, number>>();
    sortedQuarters.forEach(([, label]) => dataMap.set(label, {}));

    raw.forEach((r) => {
      const label = quarterMap.get(r.quarter_sort)!;
      const row = dataMap.get(label)!;
      const ci = clientMap.get(r.client_id)!.index;
      row[`c${ci}_a`] = (row[`c${ci}_a`] ?? 0) + r.ansr;
      row[`c${ci}_g`] = (row[`c${ci}_g`] ?? 0) + r.gastos;
    });

    const chartData = sortedQuarters.map(([, label]) => ({
      quarter: label,
      ...dataMap.get(label),
    }));

    return { clients, chartData, keyMeta };
  }, [raw]);

  if (loading)
    return (
      <div className="w-full max-w-7xl h-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
    );
  if (error)
    return (
      <p className="text-red-500 text-sm">Error cargando TER trimestral: {error}</p>
    );
  if (chartData.length === 0) return null;

  return (
    <section className="w-full max-w-7xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">
        TER trimestral por cliente
      </h2>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
          barCategoryGap="20%"
          barGap={2}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            strokeOpacity={0.08}
          />
          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 12 }}
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
          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={(props as { active?: boolean }).active}
                payload={(props as { payload?: Array<{ dataKey: string; value: number }> }).payload}
                label={(props as { label?: string }).label}
                keyMeta={keyMeta}
              />
            )}
            cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
          />
          {clients.flatMap((c) => [
            <Bar
              key={c.ansrKey}
              dataKey={c.ansrKey}
              name={`${c.name} ANSR`}
              stackId={c.id}
              fill={c.colour}
            />,
            <Bar
              key={c.gastosKey}
              dataKey={c.gastosKey}
              name={`${c.name} Gastos`}
              stackId={c.id}
              fill={c.colour}
              fillOpacity={0.4}
              radius={[4, 4, 0, 0]}
            />,
          ])}
        </BarChart>
      </ResponsiveContainer>
      <QuarterlyLegend clients={clients} />
    </section>
  );
}
