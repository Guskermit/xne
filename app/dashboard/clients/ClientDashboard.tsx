"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import ClientEngagementsTable from "./ClientEngagementsTable";
import ClientMonthlyKpis from "../ClientMonthlyKpis";
import ClientVendorExpenses from "./ClientVendorExpenses";
import ClientVendorExpensesChart from "./ClientVendorExpensesChart";
import ClientAnsrChart from "./ClientAnsrChart";
import ClientWeeklyChart from "./ClientWeeklyChart";
import ClearClientDataButton from "./ClearClientDataButton";

type ClientOption = {
  client_id: string;
  client_name: string;
};

export default function ClientDashboard({
  clients,
}: {
  clients: ClientOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fyStr = searchParams.get("fy");
  const fiscalYear = fyStr ? parseInt(fyStr, 10) : null;

  const [selectedId, setSelectedId] = useState<string>(
    clients.length > 0 ? clients[0].client_id : ""
  );

  const selectedClient = clients.find((c) => c.client_id === selectedId);

  function handleCleared() {
    router.refresh();
  }

  if (clients.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic mt-8">
        Sin datos disponibles. Sube un fichero Excel para ver los KPIs.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-10 w-full">
      {/* Global client selector */}
      <div className="w-full max-w-7xl">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
          Cliente
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full sm:max-w-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>
                {c.client_name}
              </option>
            ))}
          </select>
          {selectedClient && (
            <ClearClientDataButton
              clientId={selectedClient.client_id}
              clientName={selectedClient.client_name}
              onCleared={handleCleared}
            />
          )}
        </div>
      </div>

      {/* 1. Engagement KPIs for this client */}
      <ClientEngagementsTable clientId={selectedId} fiscalYear={fiscalYear} />

      {/* 2. Stacked bar chart – ANSR by engagement per month */}
      <ClientAnsrChart clientId={selectedId} />

      {/* 3. Weekly evolution – hours & ANSR */}
      <ClientWeeklyChart clientId={selectedId} />

      {/* 4. Monthly evolution + forecast */}
      <ClientMonthlyKpis clientId={selectedId} />

      {/* 4. Expandable vendor expenses */}
      <ClientVendorExpenses clientId={selectedId} fiscalYear={fiscalYear} />

      {/* 5. Stacked bar chart – expenses by vendor per month */}
      <ClientVendorExpensesChart clientId={selectedId} />
    </div>
  );
}
