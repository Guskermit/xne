import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type FcTotals = {
  horas_real: number;
  nsr_real:   number;
  ansr_real:  number;
  coste_real: number;
  gastos_real: number;
  horas_fc:   number;
  nsr_fc:     number;
  ansr_fc:    number;
  coste_fc:   number;
  gastos_fc:  number;
  n_engagements: number;
  fy_end_mes: string;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const hrs = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

function pct(base: number, val: number): string {
  if (!base) return "—";
  return `${((val / base) * 100).toFixed(1)} %`;
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function ForecastKpiCard({
  label,
  value,
  sub,
  isEstimate,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  isEstimate: boolean;
  highlight?: boolean;
}) {
  const baseClasses = "rounded-xl border p-4 flex flex-col gap-1 relative overflow-hidden";
  const colorClasses = isEstimate && highlight
    ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
    : isEstimate
    ? "border-amber-200 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/20"
    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 opacity-70";

  return (
    <div className={`${baseClasses} ${colorClasses}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`text-xl font-bold ${isEstimate ? "text-amber-900 dark:text-amber-100" : "text-gray-900 dark:text-gray-100"}`}>
        {value}
      </p>
      {sub && (
        <p className="text-xs text-gray-400">{sub}</p>
      )}
      {/* Estimate badge */}
      {isEstimate ? (
        <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          est. FY
        </span>
      ) : (
        <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-600">
          acum.
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default async function GlobalForecastKpisBar({
  fiscalYear,
  businessUnit,
}: {
  fiscalYear?: number;
  businessUnit?: string;
}) {
  const supabase = await createClient();

  const fcParams: Record<string, unknown> = {};
  if (fiscalYear) fcParams.p_fiscal_year = fiscalYear;
  if (businessUnit) fcParams.p_business_unit = businessUnit;

  const { data, error } = await supabase.rpc("get_global_fy_forecast_totals", fcParams);

  if (error || !data) return null;

  const fc = ((data as FcTotals[]) ?? [])[0];
  if (!fc) return null;

  // Derived
  const margen_real = fc.ansr_real - fc.coste_real;
  const margen_fc   = fc.ansr_fc   - fc.coste_fc;

  const fyAnsr   = fc.ansr_real   + fc.ansr_fc;
  const fyNsr    = fc.nsr_real    + fc.nsr_fc;
  const fyHoras  = fc.horas_real  + fc.horas_fc;
  const fyCoste  = fc.coste_real  + fc.coste_fc;
  const fyMargen = margen_real    + margen_fc;
  const fyGastos = fc.gastos_real + fc.gastos_fc;
  const fyTer    = fyAnsr + fyGastos;

  const fyEndYear = fc.fy_end_mes ? parseInt(fc.fy_end_mes.slice(0, 4), 10) : new Date().getFullYear();
  const hasEstimate = fc.horas_fc > 0 || fc.ansr_fc > 0 || fc.gastos_fc > 0;

  return (
    <section className="w-full max-w-7xl space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Estimación a fin de FY (Jun {fyEndYear})
          </p>
        </div>
        {hasEstimate && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Todas las métricas proyectadas con tasas medias de los últimos 3 meses completos
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <ForecastKpiCard
          label="Horas imputadas"
          value={hrs.format(fyHoras)}
          sub={`${fc.n_engagements} engagements`}
          isEstimate={true}
        />
        <ForecastKpiCard
          label="NSR"
          value={eur.format(fyNsr)}
          isEstimate={true}
        />
        <ForecastKpiCard
          label="ANSR"
          value={eur.format(fyAnsr)}
          isEstimate={true}
          highlight
        />
        <ForecastKpiCard
          label="Coste margen"
          value={eur.format(fyCoste)}
          isEstimate={true}
        />
        <ForecastKpiCard
          label="Margen bruto"
          value={eur.format(fyMargen)}
          sub={pct(fyAnsr, fyMargen)}
          isEstimate={true}
        />
        <ForecastKpiCard
          label="Gastos totales"
          value={eur.format(fyGastos)}
          isEstimate={true}
        />
        <ForecastKpiCard
          label="TER"
          value={eur.format(fyTer)}
          isEstimate={true}
          highlight
        />
      </div>
    </section>
  );
}
