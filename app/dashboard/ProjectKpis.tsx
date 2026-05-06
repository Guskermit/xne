import { createClient } from "@/lib/supabase/server";
import ScrollCell from "./ScrollCell";
import BudgetCell from "./BudgetCell";

type EngagementKpi = {
  client_name: string;
  project_name: string;
  engagement_id: string;
  engagement_name: string;
  horas: number;
  nsr: number;
  ansr: number;
  coste_margen: number;
  margen_bruto: number;
  gasto_total: number;
  ter?: number;
  budget?: number | null;
};

function ter(r: EngagementKpi): number {
  return r.ter ?? ((r.ansr ?? 0) + (r.gasto_total ?? 0));
}

async function fetchKpis(): Promise<EngagementKpi[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_engagement_kpis");
  if (error) throw new Error(error.message);
  return (data as EngagementKpi[]) ?? [];
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const hrs = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
});

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

function remainingColor(remaining: number): string {
  if (remaining > 0) return "text-green-600 dark:text-green-400";
  if (remaining === 0) return "text-gray-500";
  return "text-red-600 dark:text-red-400";
}

function pctConsumed(terVal: number, budget: number | null | undefined): string {
  if (!budget) return "—";
  return `${((terVal / budget) * 100).toFixed(1)} %`;
}

function pctConsumedColor(terVal: number, budget: number | null | undefined): string {
  if (!budget) return "text-gray-400";
  const p = (terVal / budget) * 100;
  if (p <= 80) return "text-green-600 dark:text-green-400";
  if (p <= 100) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Main component (Server Component)
// ---------------------------------------------------------------------------
export default async function ProjectKpis() {
  let rows: EngagementKpi[];
  try {
    rows = await fetchKpis();
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

  // Totals
  const totalHoras = rows.reduce((s, r) => s + r.horas, 0);
  const totalNsr = rows.reduce((s, r) => s + r.nsr, 0);
  const totalAnsr = rows.reduce((s, r) => s + r.ansr, 0);
  const totalMargen = rows.reduce((s, r) => s + r.margen_bruto, 0);
  const totalGastos = rows.reduce((s, r) => s + (r.gasto_total ?? 0), 0);
  const totalTer    = rows.reduce((s, r) => s + ter(r), 0);
  const totalBudget = rows.every((r) => r.budget != null)
    ? rows.reduce((s, r) => s + (r.budget ?? 0), 0)
    : null;
  const totalCoste = rows.reduce((s, r) => s + r.coste_margen, 0);

  return (
    <section className="w-full max-w-7xl space-y-6">
      <h2 className="text-lg font-semibold">Resumen por engagement</h2>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Horas imputadas" value={hrs.format(totalHoras)} sub={`${rows.length} engagements`} />
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

      {/* Detail table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 whitespace-nowrap">Cliente</th>
              <th className="px-4 py-3 whitespace-nowrap">Proyecto</th>
              <th className="px-4 py-3 whitespace-nowrap">Engagement</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Horas</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">NSR</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">ANSR</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Coste</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Margen bruto</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">% Margen</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Gastos</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">TER</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Presupuesto</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Restante</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">% Consumido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => (
              <tr
                key={r.engagement_id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <ScrollCell text={r.client_name} className="text-gray-700 dark:text-gray-300 max-w-[180px]" />
                <ScrollCell text={r.project_name} className="text-gray-500 dark:text-gray-400 max-w-[160px]" />
                <ScrollCell text={r.engagement_name} className="font-medium text-gray-900 dark:text-gray-100 max-w-[200px]" />
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {hrs.format(r.horas)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {eur.format(r.nsr)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                  {eur.format(r.ansr)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                  {eur.format(r.coste_margen)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                  {eur.format(r.margen_bruto)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pctColor(r.ansr, r.margen_bruto)}`}>
                  {pct(r.ansr, r.margen_bruto)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                  {r.gasto_total > 0 ? eur.format(r.gasto_total) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                  {eur.format(ter(r))}
                </td>
                <BudgetCell engagementId={r.engagement_id} initialBudget={r.budget ?? null} />
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                  r.budget != null ? remainingColor(r.budget - ter(r)) : "text-gray-300 dark:text-gray-600"
                }`}>
                  {r.budget != null ? eur.format(r.budget - ter(r)) : "—"}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pctConsumedColor(ter(r), r.budget)}`}>
                  {pctConsumed(ter(r), r.budget)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-gray-100">
              <td className="px-4 py-3" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{hrs.format(totalHoras)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalNsr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalAnsr)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalCoste)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalMargen)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctColor(totalAnsr, totalMargen)}`}>
                {pct(totalAnsr, totalMargen)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalGastos)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{eur.format(totalTer)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {totalBudget != null ? eur.format(totalBudget) : "—"}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${
                totalBudget != null ? remainingColor(totalBudget - totalTer) : "text-gray-400"
              }`}>
                {totalBudget != null ? eur.format(totalBudget - totalTer) : "—"}
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${pctConsumedColor(totalTer, totalBudget)}`}>
                {pctConsumed(totalTer, totalBudget)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
