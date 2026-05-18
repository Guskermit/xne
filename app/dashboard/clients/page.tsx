import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import FiscalYearSelector from "../FiscalYearSelector";
import ClientDashboard from "./ClientDashboard";

type ClientOption = {
  client_id: string;
  client_name: string;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const supabase = await createClient();
  await searchParams; // trigger dynamic rendering

  const [{ data: fyData }, { data: clientsData }] = await Promise.all([
    supabase.rpc("get_fiscal_years"),
    supabase.rpc("get_client_kpis"),
  ]);

  const fiscalYears =
    (fyData as { fiscal_year: number }[] | null)?.map((r) => r.fiscal_year) ?? [];

  const clients: ClientOption[] =
    ((clientsData as ClientOption[] | null) ?? []).map((r) => ({
      client_id: r.client_id,
      client_name: r.client_name,
    }));

  return (
    <main className="flex flex-col items-center gap-10 p-8 pt-10">
      <div className="flex w-full max-w-7xl items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Visión por Cliente
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Engagements, evolución mensual y gastos por proveedor
          </p>
        </div>
        <Suspense fallback={null}>
          <FiscalYearSelector years={fiscalYears} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <ClientDashboard clients={clients} />
      </Suspense>
    </main>
  );
}
