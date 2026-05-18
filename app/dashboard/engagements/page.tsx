import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ProjectKpis from "../ProjectKpis";
import EmployeeWeekly from "../EmployeeWeekly";
import FiscalYearSelector from "../FiscalYearSelector";

export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; active?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const fiscalYear = params.fy ? parseInt(params.fy, 10) : undefined;
  const activeOnly = params.active === "1";

  const { data: fyData } = await supabase.rpc("get_fiscal_years");
  const fiscalYears =
    (fyData as { fiscal_year: number }[] | null)?.map((r) => r.fiscal_year) ?? [];

  const tableSkeleton = (
    <div className="w-full max-w-7xl space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-4 h-20 animate-pulse"
          />
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 h-64 animate-pulse bg-gray-100 dark:bg-gray-800" />
    </div>
  );

  return (
    <main className="flex flex-col items-center gap-10 p-8 pt-10">
      <div className="flex w-full max-w-7xl items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Visión por Engagement
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            KPIs detallados por engagement y desglose semanal por empleado
          </p>
        </div>
        <Suspense fallback={null}>
          <FiscalYearSelector years={fiscalYears} />
        </Suspense>
      </div>

      <Suspense fallback={tableSkeleton}>
        <ProjectKpis fiscalYear={fiscalYear} activeOnly={activeOnly} />
      </Suspense>

      <EmployeeWeekly fiscalYear={fiscalYear} />
    </main>
  );
}
