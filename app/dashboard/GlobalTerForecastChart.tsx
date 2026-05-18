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
  ansr_real: number;
  ansr_fc: number;
  gastos_real: number;
  gastos_fc: number;
  is_partial: boolean;
  is_forecast: boolean;
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
type TooltipPayloadEntry = { name: string; value: number; fill: string };

function CustomTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  rows: RawRow[];
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const row = rows.find((r) => r.mes === label);
  const total = (row?.ansr_real ?? 0) + (row?.ansr_fc ?? 0) +
                (row?.gastos_real ?? 0) + (row?.gastos_fc ?? 0);
  const totalReal = (row?.ansr_real ?? 0) + (row?.gastos_real ?? 0);
  const totalFc   = (row?.ansr_fc ?? 0) + (row?.gastos_fc ?? 0);
  const isPartial  = row?.is_partial  ?? false;
  const isForecast = row?.is_forecast ?? false;

  const badge = isForecast
    ? <span className="rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wide">Forecast</span>
    : isPartial
    ? <span className="rounded px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-semibold uppercase tracking-wide">Parcial + est.</span>
    : null;

  const series = [
    { key: "ansr_real",    label: "ANSR real",    color: "#3b82f6", val: row?.ansr_real ?? 0 },
    { key: "ansr_fc",      label: "ANSR est.",    color: "#93c5fd", val: row?.ansr_fc ?? 0 },
    { key: "gastos_real",  label: "Gastos real",  color: "#f59e0b", val: row?.gastos_real ?? 0 },
    { key: "gastos_fc",    label: "Gastos est.",  color: "#fcd34d", val: row?.gastos_fc ?? 0 },
  ].filter((s) => s.val > 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-xs space-y-1 min-w-[220px]">
      <div className="flex items-center gap-2 mb-2">
        <p className="font-semibold text-gray-700 dark:text-gray-200">{fmtMonth(label)}</p>
        {badge}
      </div>
      {series.map((s) => {
        const pct = total > 0 ? (s.val / total) * 100 : 0;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-gray-600 dark:text-gray-300">{s.label}</span>
            <span className="ml-auto tabular-nums font-medium text-gray-900 dark:text-gray-100 pl-4 whitespace-nowrap">
              {eur.format(s.val)}{" "}
              <span className="text-gray-400 font-normal">({pct.toFixed(1)} %)</span>
            </span>
          </div>
        );
      })}
      {isPartial && totalFc > 0 && (
        <div className="border-t border-dashed border-gray-100 dark:border-gray-700 pt-1 mt-1 flex justify-between text-gray-500 dark:text-gray-400">
          <span>Real acumulado</span>
          <span className="tabular-nums">{eur.format(totalReal)}</span>
        </div>
      )}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-1 mt-1 flex justify-between font-semibold text-gray-800 dark:text-gray-200">
        <span>TER total</span>
        <span className="tabular-nums">{eur.format(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom X-axis tick
// ---------------------------------------------------------------------------
function CustomXTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  forecastMonths: Set<string>;
  partialMonths: Set<string>;
}) {
  const { x = 0, y = 0, payload, forecastMonths, partialMonths } = props;
  const isFC      = payload ? forecastMonths.has(payload.value) : false;
  const isPartial = payload ? partialMonths.has(payload.value)  : false;
  const color = isFC ? "#f59e0b" : isPartial ? "#3b82f6" : "#6b7280";
  const sublabel = isFC ? "↑est." : isPartial ? "+est." : null;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill={color}
        fontSize={11} fontWeight={(isFC || isPartial) ? 600 : 400}>
        {payload ? fmtMonth(payload.value) : ""}
      </text>
      {sublabel && (
        <text x={0} y={0} dy={26} textAnchor="middle" fill={color} fontSize={9}>
          {sublabel}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// SVG stripe pattern IDs
// ---------------------------------------------------------------------------
const STRIPE_ANSR   = "gtfc-stripe-ansr";
const STRIPE_GASTOS = "gtfc-stripe-gastos";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobalTerForecastChart() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear   = fyStr ? parseInt(fyStr, 10) : null;
  const businessUnit = searchParams.get("bu");

  const [rows, setRows]       = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = {};
    if (fiscalYear !== null) params.p_fiscal_year = fiscalYear;
    if (businessUnit) params.p_business_unit = businessUnit;

    supabase
      .rpc("get_global_monthly_ter_with_forecast", params)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setRows([]); }
        else setRows((data as RawRow[]) ?? []);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, businessUnit]);

  if (loading)
    return <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />;
  if (error)
    return <p className="text-red-500 text-sm">Error cargando forecast: {error}</p>;
  if (rows.length === 0) return null;

  const forecastMonths = new Set(rows.filter((r) => r.is_forecast).map((r) => r.mes));
  const partialMonths  = new Set(rows.filter((r) => r.is_partial).map((r) => r.mes));
  const hasEstimation  = forecastMonths.size > 0 || partialMonths.size > 0;

  return (
    <section className="w-full max-w-7xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Evolución mensual del TER con forecast
        </h2>
        {hasEstimation && (
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {partialMonths.size > 0 && (
              <span className="flex items-center gap-1.5">
                <svg width="18" height="10"><defs><pattern id="legend-stripe-blue" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><rect width="4" height="4" fill="#3b82f6" fillOpacity="0.25" /><line x1="0" y1="0" x2="0" y2="4" stroke="#3b82f6" strokeWidth="2" /></pattern></defs><rect width="18" height="10" rx="2" fill="url(#legend-stripe-blue)" /></svg>
                <span className="text-blue-600 dark:text-blue-400">Mes actual (+est.)</span>
              </span>
            )}
            {forecastMonths.size > 0 && (
              <span className="flex items-center gap-1.5">
                <svg width="18" height="10"><defs><pattern id="legend-stripe-amber" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><rect width="4" height="4" fill="#f59e0b" fillOpacity="0.25" /><line x1="0" y1="0" x2="0" y2="4" stroke="#f59e0b" strokeWidth="2" /></pattern></defs><rect width="18" height="10" rx="2" fill="url(#legend-stripe-amber)" /></svg>
                <span className="text-amber-600 dark:text-amber-400">Meses forecast (↑est.)</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* SVG stripe patterns (hidden, referenced by fill url) */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <pattern id={STRIPE_ANSR} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#3b82f6" fillOpacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#3b82f6" strokeWidth="2.5" />
          </pattern>
          <pattern id={STRIPE_GASTOS} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#f59e0b" fillOpacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#f59e0b" strokeWidth="2.5" />
          </pattern>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={rows}
          margin={{ top: 4, right: 24, left: 8, bottom: hasEstimation ? 12 : 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
          <XAxis
            dataKey="mes"
            tick={(props) => {
              const { x, y, payload } = props as { x?: number; y?: number; payload?: { value: string } };
              return (
                <CustomXTick
                  x={x}
                  y={y}
                  payload={payload}
                  forecastMonths={forecastMonths}
                  partialMonths={partialMonths}
                />
              );
            }}
            tickLine={false}
            axisLine={false}
            height={hasEstimation ? 36 : 24}
          />
          <YAxis
            tickFormatter={yTickFormatter}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            content={(props) => {
              const p = props as unknown as { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string };
              return (
                <CustomTooltip
                  active={p.active}
                  payload={p.payload}
                  label={p.label}
                  rows={rows}
                />
              );
            }}
            cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) =>
              value === "ANSR est." || value === "Gastos est."
                ? <span style={{ color: "#9ca3af" }}>{value}</span>
                : value
            }
          />

          {/* 4 stacked bars: real (solid) + forecast (striped) for ANSR and Gastos */}
          <Bar dataKey="ansr_real"   name="ANSR"         stackId="ter" fill="#3b82f6" />
          <Bar dataKey="ansr_fc"     name="ANSR est."    stackId="ter" fill={`url(#${STRIPE_ANSR})`}   stroke="#3b82f6" strokeWidth={0.5} />
          <Bar dataKey="gastos_real" name="Gastos"       stackId="ter" fill="#f59e0b" />
          <Bar dataKey="gastos_fc"   name="Gastos est."  stackId="ter" fill={`url(#${STRIPE_GASTOS})`} stroke="#f59e0b" strokeWidth={0.5} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
