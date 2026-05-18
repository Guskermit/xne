import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProjectKpis from "./ProjectKpis";
import GlobalForecastKpisBar from "./GlobalForecastKpisBar";
import FiscalYearSelector from "./FiscalYearSelector";
import BusinessUnitSelector from "./BusinessUnitSelector";
import GlobalTerChart from "./GlobalTerChart";
import GlobalVendorExpensesChart from "./GlobalVendorExpensesChart";
import GlobalClientExpensesChart from "./GlobalClientExpensesChart";
import GlobalTerBreakdownChart from "./GlobalTerBreakdownChart";
import GlobalQuarterlyTerChart from "./GlobalQuarterlyTerChart";
import GlobalTerForecastChart from "./GlobalTerForecastChart";
import UploadExcel from "./UploadExcel";
import ClearDatabaseButtonWithRefresh from "./ClearDatabaseButtonWithRefresh";

const navCards = [
  {
    href: "/dashboard/clients",
    title: "Visión por Cliente",
    description:
      "KPIs agregados, evolución mensual y gastos por proveedor de cada cliente.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    color: "blue",
  },
  {
    href: "/dashboard/engagements",
    title: "Visión por Engagement",
    description:
      "Tabla detallada de KPIs por engagement con desglose de horas y evolución semanal.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    color: "indigo",
  },
  {
    href: "/dashboard/evolution",
    title: "Evolución por Fiscal Year",
    description:
      "Evolución mensual de KPIs globales agrupada por fiscal year.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    color: "emerald",
  },
] as const;

const colorMap = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950",
    border: "border-blue-200 dark:border-blue-800",
    icon: "text-blue-600 dark:text-blue-400",
    hover: "hover:border-blue-400 dark:hover:border-blue-600",
  },
  indigo: {
    bg: "bg-indigo-50 dark:bg-indigo-950",
    border: "border-indigo-200 dark:border-indigo-800",
    icon: "text-indigo-600 dark:text-indigo-400",
    hover: "hover:border-indigo-400 dark:hover:border-indigo-600",
  },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: "text-emerald-600 dark:text-emerald-400",
    hover: "hover:border-emerald-400 dark:hover:border-emerald-600",
  },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; active?: string; bu?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const fiscalYear   = params.fy ? parseInt(params.fy, 10) : undefined;
  const activeOnly   = params.active === "1";
  const businessUnit = params.bu || undefined;

  const { data: fyData } = await supabase.rpc("get_fiscal_years");
  const fiscalYears =
    (fyData as { fiscal_year: number }[] | null)?.map((r) => r.fiscal_year) ?? [];

  const cardsSkeleton = (
    <div className="w-full max-w-7xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-4 h-20 animate-pulse"
        />
      ))}
    </div>
  );

  return (
    <main className="flex flex-col items-center gap-10 p-8 pt-10">
      {/* Page header */}
      <div className="flex w-full max-w-7xl items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Resumen global
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Todos los engagements
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Suspense fallback={null}>
            <BusinessUnitSelector />
          </Suspense>
          <Suspense fallback={null}>
            <FiscalYearSelector years={fiscalYears} />
          </Suspense>
        </div>
      </div>

      {/* Global KPI summary cards */}
      <Suspense fallback={cardsSkeleton}>
        <ProjectKpis fiscalYear={fiscalYear} activeOnly={activeOnly} businessUnit={businessUnit} summaryOnly />
      </Suspense>

      {/* Forecast KPIs — estimated totals at FY end */}
      <Suspense fallback={cardsSkeleton}>
        <GlobalForecastKpisBar fiscalYear={fiscalYear} businessUnit={businessUnit} />
      </Suspense>

      {/* Global TER with forecast (striped future months) */}
      <Suspense fallback={
        <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      }>
        <GlobalTerForecastChart />
      </Suspense>

      {/* Global TER chart by client */}
      <Suspense fallback={
        <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      }>
        <GlobalTerChart />
      </Suspense>

      {/* Global vendor expenses chart */}
      <Suspense fallback={
        <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      }>
        <GlobalVendorExpensesChart />
      </Suspense>

      {/* Global client expenses chart */}
      <Suspense fallback={
        <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      }>
        <GlobalClientExpensesChart />
      </Suspense>

      {/* Global TER breakdown: ANSR vs Gastos */}
      <Suspense fallback={
        <div className="w-full max-w-7xl h-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      }>
        <GlobalTerBreakdownChart />
      </Suspense>

      {/* Global quarterly TER by client (grouped stacked bars) */}
      <Suspense fallback={
        <div className="w-full max-w-7xl h-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
      }>
        <GlobalQuarterlyTerChart />
      </Suspense>

      {/* Section navigation cards */}
      <div className="w-full max-w-7xl grid grid-cols-1 sm:grid-cols-3 gap-6">
        {navCards.map(({ href, title, description, icon, color }) => {
          const c = colorMap[color];
          return (
            <Link
              key={href}
              href={href}
              className={`group rounded-2xl border ${c.border} ${c.hover} ${c.bg} p-6 flex flex-col gap-4 transition-all hover:shadow-md`}
            >
              <div className={`${c.icon}`}>{icon}</div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:underline">
                  {title}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {description}
                </p>
              </div>
              <span className={`self-start text-xs font-medium ${c.icon} flex items-center gap-1`}>
                Ir a la sección
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>

      {/* Data management */}
      <div className="flex w-full max-w-7xl items-center gap-3">
        <UploadExcel />
        <ClearDatabaseButtonWithRefresh />
      </div>
    </main>
  );
}
