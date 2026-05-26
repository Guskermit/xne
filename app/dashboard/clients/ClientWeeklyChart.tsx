"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ComposedChart,
  Bar,
  Line,
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
type WeekRow = {
  week_key: string;
  charged_hours: number;
  ansr_revenue: number;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const fmtH = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmtWeek(wk: string): string {
  return new Date(wk + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
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
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 text-xs space-y-1.5">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">
        Semana {label ? fmtWeek(label) : ""}
      </p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-gray-600 dark:text-gray-300">{p.name}</span>
          <span className="ml-auto tabular-nums font-medium text-gray-900 dark:text-gray-100 pl-4 whitespace-nowrap">
            {p.dataKey === "ansr_revenue" ? eur.format(p.value) : fmtH.format(p.value) + " h"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ClientWeeklyChart({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear = fyStr ? parseInt(fyStr, 10) : null;

  const [rows, setRows] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = { p_client_id: clientId };
    if (fiscalYear) params.p_fiscal_year = fiscalYear;
    supabase
      .rpc("get_client_weekly_kpis", params)
      .then(({ data, error }) => {
        if (error) { setError(error.message); setRows([]); }
        else setRows((data as WeekRow[]) ?? []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, fiscalYear]);

  // Maximum values for Y-axis domain padding
  const maxHours = useMemo(() => Math.max(...rows.map((r) => r.charged_hours), 0), [rows]);
  const maxAnsr = useMemo(() => Math.max(...rows.map((r) => r.ansr_revenue), 0), [rows]);

  return (
    <section className="w-full max-w-7xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
        Evolución semanal de imputaciones
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        Horas imputadas y ANSR por semana
      </p>

      {loading && (
        <p className="text-sm text-gray-400 italic text-center py-10">Cargando…</p>
      )}
      {!loading && error && (
        <p className="text-sm text-red-500 text-center py-10">{error}</p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-gray-400 italic text-center py-10">
          Sin datos de imputaciones para este cliente.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={rows} margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week_key"
              tickFormatter={fmtWeek}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              interval="preserveStartEnd"
            />
            {/* Left axis – hours */}
            <YAxis
              yAxisId="hours"
              orientation="left"
              tickFormatter={(v: number) => fmtH.format(v)}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              domain={[0, Math.ceil(maxHours * 1.1) || 10]}
              label={{
                value: "Horas",
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: { fontSize: 11, fill: "#9ca3af" },
              }}
            />
            {/* Right axis – ANSR */}
            <YAxis
              yAxisId="ansr"
              orientation="right"
              tickFormatter={(v: number) =>
                new Intl.NumberFormat("es-ES", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                  style: "currency",
                  currency: "EUR",
                }).format(v)
              }
              tick={{ fontSize: 11, fill: "#6b7280" }}
              domain={[0, Math.ceil(maxAnsr * 1.1) || 1000]}
              label={{
                value: "ANSR",
                angle: 90,
                position: "insideRight",
                offset: 10,
                style: { fontSize: 11, fill: "#9ca3af" },
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
            />
            <Bar
              yAxisId="hours"
              dataKey="charged_hours"
              name="Horas"
              fill="#3b82f6"
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            />
            <Line
              yAxisId="ansr"
              type="monotone"
              dataKey="ansr_revenue"
              name="ANSR"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3, fill: "#10b981" }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
