import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ProjectMonthlyKpis from "../ProjectMonthlyKpis";
import ClientMonthlyKpis from "../ClientMonthlyKpis";
import FiscalYearSelector from "../FiscalYearSelector";

export default async function EvolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const { data: fyData } = await supabase.rpc("get_fiscal_years");
  const fiscalYears =
    (fyData as { fiscal_year: number }[] | null)?.map((r) => r.fiscal_year) ?? [];

  const simpleSkeleton = (
    <div className="w-full max-w-7xl h-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
  );

  return (
    <main className="flex flex-col items-center gap-10 p-8 pt-10">
      <div className="flex w-full max-w-7xl items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Evolución por Fiscal Year
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Evolución mensual de KPIs por engagement y por cliente
          </p>
        </div>
        <Suspense fallback={null}>
          <FiscalYearSelector years={fiscalYears} />
        </Suspense>
      </div>

      <Suspense fallback={simpleSkeleton}>
        <ProjectMonthlyKpis />
      </Suspense>

      <Suspense fallback={simpleSkeleton}>
        <ClientMonthlyKpis />
      </Suspense>
    </main>
  );
}
