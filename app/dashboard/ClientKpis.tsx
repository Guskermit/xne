import { createClient } from "@/lib/supabase/server";
import ClientKpisTable, { ClientKpi } from "./ClientKpisTable";

async function fetchClientKpis(
  fiscalYear?: number,
  activeOnly?: boolean
): Promise<ClientKpi[]> {
  const supabase = await createClient();
  const params: Record<string, unknown> = {};
  if (fiscalYear) params.p_fiscal_year = fiscalYear;
  if (activeOnly) params.p_active_only = true;
  const { data, error } = await supabase.rpc("get_client_kpis", params);
  if (error) throw new Error(error.message);
  return (data as ClientKpi[]) ?? [];
}

export default async function ClientKpis({
  fiscalYear,
  activeOnly,
}: {
  fiscalYear?: number;
  activeOnly?: boolean;
}) {
  let rows: ClientKpi[];
  try {
    rows = await fetchClientKpis(fiscalYear, activeOnly);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return (
      <p className="text-sm text-red-500">
        No se pudo cargar el resumen por cliente: {msg}
      </p>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="w-full max-w-7xl space-y-4">
      <h2 className="text-lg font-semibold">Resumen por cliente</h2>
      <ClientKpisTable rows={rows} />
    </section>
  );
}
