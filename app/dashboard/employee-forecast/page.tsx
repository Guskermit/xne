import React, { Suspense } from "react";
import EmployeeWeekly from "../EmployeeWeekly";
import UploadForecast from "../UploadForecast";

export default function Page({ searchParams }: { searchParams?: { fy?: string } }) {
  const fiscalYear = searchParams?.fy ? parseInt(searchParams.fy, 10) : undefined;

  return (
    <main className="flex flex-col items-center gap-10 p-8 pt-10">
      <div className="flex w-full max-w-7xl items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Forecast por empleado</h1>
          <p className="text-gray-500 text-sm mt-1">Horas imputadas y forecast por proyecto, por empleado</p>
        </div>
      </div>

      <div className="w-full max-w-7xl">
        <UploadForecast />
      </div>

      <Suspense fallback={null}>
        {/* EmployeeWeekly is a client component that handles fetching */}
        <EmployeeWeekly fiscalYear={fiscalYear} />
      </Suspense>
    </main>
  );
}
