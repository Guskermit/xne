import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../(auth)/actions";
import UploadExcel from "./UploadExcel";
import ProjectKpis from "./ProjectKpis";
import ClientKpis from "./ClientKpis";
import ProjectMonthlyKpis from "./ProjectMonthlyKpis";
import ClientMonthlyKpis from "./ClientMonthlyKpis";
import EngagementExpensesByVendor from "./EngagementExpensesByVendor";
import FiscalYearSelector from "./FiscalYearSelector";
import ClearDatabaseButtonWithRefresh from "./ClearDatabaseButtonWithRefresh";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; active?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const fiscalYear = params.fy ? parseInt(params.fy, 10) : undefined;
  const activeOnly = params.active === "1";

  // Fetch available fiscal years for the selector
  const { data: fyData } = await supabase.rpc("get_fiscal_years");
  const fiscalYears =
    (fyData as { fiscal_year: number }[] | null)?.map((r) => r.fiscal_year) ?? [];

  const tableSkeleton = (
    <div className="w-full max-w-7xl space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-4 h-20 animate-pulse"
          />
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 h-48 animate-pulse bg-gray-100 dark:bg-gray-800" />
    </div>
  );

  const simpleSkeleton = (
    <div className="w-full max-w-7xl h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
  );

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8 pt-16">
      <div className="flex w-full max-w-7xl items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{user.email}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Suspense fallback={null}>
            <FiscalYearSelector years={fiscalYears} />
          </Suspense>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      <Suspense fallback={tableSkeleton}>
        <ClientKpis fiscalYear={fiscalYear} activeOnly={activeOnly} />
      </Suspense>

      <Suspense fallback={tableSkeleton}>
        <ProjectKpis fiscalYear={fiscalYear} activeOnly={activeOnly} />
      </Suspense>

      <Suspense fallback={simpleSkeleton}>
        <ProjectMonthlyKpis />
      </Suspense>

      <Suspense fallback={simpleSkeleton}>
        <ClientMonthlyKpis />
      </Suspense>

      <Suspense fallback={simpleSkeleton}>
        <EngagementExpensesByVendor />
      </Suspense>

      <div className="flex w-full max-w-7xl items-center gap-3">
        <UploadExcel />
        <ClearDatabaseButtonWithRefresh />
      </div>
    </main>
  );
}
