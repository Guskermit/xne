import { createClient } from "@/lib/supabase/server";
import ProjectKpisTable, { EngagementKpi } from "./ProjectKpisTable";

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

function terVal(r: EngagementKpi): number {
  return r.ter ?? ((r.ansr ?? 0) + (r.gasto_total ?? 0));
}

async function fetchKpis(
  fiscalYear?: number,
  activeOnly?: boolean
): Promise<EngagementKpi[]> {
  const supabase = await createClient();
  const params: Record<string, unknown> = {};
  if (fiscalYear) params.p_fiscal_year = fiscalYear;
  if (activeOnly) params.p_active_only = true;
  const { data, error } = await supabase.rpc("get_engagement_kpis", params);
  if (error) throw new Error(error.message);
  return (data as EngagementKpi[]) ?? [];
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1 ${
        highlight
          ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default async function ProjectKpis({
  fiscalYear,
  activeOnly,
}: {
  fiscalYear?: number;
  activeOnly?: boolean;
}) {
  let rows: EngagementKpi[];
  try {
    rows = await fetchKpis(fiscalYear, activeOnly);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return (
      <p className="text-sm text-red-500">
        No se pudo conectar a la base de datos: {msg}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        Aún no hay datos cargados. Sube un fichero Excel para ver los KPIs.
      </p>
    );
  }

  const totalHoras  = rows.reduce((s, r) => s + r.horas, 0);
  const totalNsr    = rows.reduce((s, r) => s + r.nsr, 0);
  const totalAnsr   = rows.reduce((s, r) => s + r.ansr, 0);
  const totalMargen = rows.reduce((s, r) => s + r.margen_bruto, 0);
  const totalGastos = rows.reduce((s, r) => s + (r.gasto_total ?? 0), 0);
  const totalTer    = rows.reduce((s, r) => s + terVal(r), 0);
  const totalCoste  = rows.reduce((s, r) => s + r.coste_margen, 0);

  return (
    <section className="w-full max-w-7xl space-y-6">
      <h2 className="text-lg font-semibold">Resumen por engagement</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Horas imputadas"
          value={hrs.format(totalHoras)}
          sub={`${rows.length} engagements`}
        />
        <KpiCard label="NSR" value={eur.format(totalNsr)} />
        <KpiCard label="ANSR" value={eur.format(totalAnsr)} highlight />
        <KpiCard label="Coste margen" value={eur.format(totalCoste)} />
        <KpiCard
          label="Margen bruto"
          value={eur.format(totalMargen)}
          sub={pct(totalAnsr, totalMargen)}
          highlight={totalMargen > 0}
        />
        <KpiCard label="Gastos totales" value={eur.format(totalGastos)} />
        <KpiCard label="TER" value={eur.format(totalTer)} highlight />
      </div>

      <ProjectKpisTable rows={rows} />
    </section>
  );
}
