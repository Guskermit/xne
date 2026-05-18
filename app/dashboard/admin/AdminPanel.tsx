"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ClientRow    = { client_id: string; client_name: string; color: string | null; business_unit: string | null };
type VendorRow    = { vendor_id: string; vendor_name: string; color: string | null };
type EngagementRow = {
  engagement_id: string;
  engagement_name: string;
  client_name: string;
  budget: number | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Colour presets for the picker
// ---------------------------------------------------------------------------
const PALETTE = [
  "#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444",
  "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
  "#14b8a6","#a855f7","#eab308","#22c55e","#0ea5e9","#f43f5e",
];

// ---------------------------------------------------------------------------
// Utility: small colour swatch picker
// ---------------------------------------------------------------------------
function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
          style={{
            background: c,
            borderColor: value === c ? "#111" : "transparent",
            boxShadow: value === c ? "0 0 0 2px #fff,0 0 0 4px #111" : undefined,
          }}
          title={c}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-gray-900 text-white text-sm px-5 py-3 shadow-xl animate-fade-in">
      {msg}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main admin panel
// ---------------------------------------------------------------------------
export default function AdminPanel() {
  const supabase = createClient();

  const [clients,     setClients]     = useState<ClientRow[]>([]);
  const [vendors,     setVendors]     = useState<VendorRow[]>([]);
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState<string | null>(null);
  const [pending,     startTransition] = useTransition();

  // Load all data on mount
  useEffect(() => {
    Promise.all([
      supabase.rpc("admin_list_clients"),
      supabase.rpc("admin_list_vendors"),
      supabase.rpc("admin_list_engagements"),
    ]).then(([{ data: c }, { data: v }, { data: e }]) => {
      setClients((c as ClientRow[]) ?? []);
      setVendors((v as VendorRow[]) ?? []);
      setEngagements((e as EngagementRow[]) ?? []);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = (msg: string) => setToast(msg);

  // ---- Client color -------------------------------------------------------
  const setClientColor = (clientId: string, color: string) => {
    setClients((prev) =>
      prev.map((c) => (c.client_id === clientId ? { ...c, color } : c))
    );
    startTransition(async () => {
      const { error } = await supabase.rpc("admin_set_client_color", {
        p_client_id: clientId,
        p_color: color,
      });
      if (error) notify(`Error: ${error.message}`);
      else notify("Color de cliente guardado");
    });
  };

  // ---- Client business unit -----------------------------------------------
  const setClientBusinessUnit = (clientId: string, business_unit: string) => {
    setClients((prev) =>
      prev.map((c) => (c.client_id === clientId ? { ...c, business_unit } : c))
    );
    startTransition(async () => {
      const { error } = await supabase.rpc("admin_set_client_business_unit", {
        p_client_id: clientId,
        p_business_unit: business_unit,
      });
      if (error) notify(`Error: ${error.message}`);
      else notify("Business unit guardado");
    });
  };

  // ---- Vendor color -------------------------------------------------------
  const setVendorColor = (vendorId: string, color: string) => {
    setVendors((prev) =>
      prev.map((v) => (v.vendor_id === vendorId ? { ...v, color } : v))
    );
    startTransition(async () => {
      const { error } = await supabase.rpc("admin_set_vendor_color", {
        p_vendor_id: vendorId,
        p_color: color,
      });
      if (error) notify(`Error: ${error.message}`);
      else notify("Color de proveedor guardado");
    });
  };

  // ---- Engagement budget + status -----------------------------------------
  const setEngagement = (
    engagementId: string,
    budget: number | null,
    status: string
  ) => {
    setEngagements((prev) =>
      prev.map((e) =>
        e.engagement_id === engagementId ? { ...e, budget, status } : e
      )
    );
    startTransition(async () => {
      const { error } = await supabase.rpc("admin_set_engagement", {
        p_engagement_id: engagementId,
        p_budget: budget,
        p_status: status,
      });
      if (error) notify(`Error: ${error.message}`);
      else notify("Engagement actualizado");
    });
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Cargando configuración…
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* ---- Clients ----------------------------------------------------- */}
      <Section title="Configuración de clientes">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {clients.map((c) => (
            <div key={c.client_id} className="py-4 flex flex-col sm:flex-row sm:items-start gap-4">
              {/* Name + color dot */}
              <div className="flex items-center gap-3 min-w-0 sm:w-56 pt-0.5">
                <span
                  className="w-4 h-4 rounded-full shrink-0 border border-gray-200"
                  style={{ background: c.color ?? "#d1d5db" }}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                  {c.client_name}
                </span>
              </div>
              {/* Right side: business unit toggle + color picker */}
              <div className="flex flex-col gap-3 flex-1">
                {/* Business unit segmented control */}
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden w-fit">
                  {(["Studio+", "Hospitality"] as const).map((bu) => {
                    const active = (c.business_unit ?? "Studio+") === bu;
                    return (
                      <button
                        key={bu}
                        type="button"
                        onClick={() => setClientBusinessUnit(c.client_id, bu)}
                        className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        {bu}
                      </button>
                    );
                  })}
                </div>
                <ColorPicker value={c.color} onChange={(col) => setClientColor(c.client_id, col)} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Vendors ----------------------------------------------------- */}
      <Section title="Color por proveedor">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {vendors.map((v) => (
            <div key={v.vendor_id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 sm:w-56">
                <span
                  className="w-4 h-4 rounded-full shrink-0 border border-gray-200"
                  style={{ background: v.color ?? "#d1d5db" }}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                  {v.vendor_name}
                </span>
              </div>
              <ColorPicker value={v.color} onChange={(col) => setVendorColor(v.vendor_id, col)} />
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Engagements ------------------------------------------------- */}
      <Section title="Presupuesto y estado de engagements">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="pb-3 pr-4 font-medium">Cliente</th>
                <th className="pb-3 pr-4 font-medium">Engagement</th>
                <th className="pb-3 pr-4 font-medium w-40">Presupuesto (€)</th>
                <th className="pb-3 font-medium w-32">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {engagements.map((e) => (
                <EngagementRow
                  key={e.engagement_id}
                  row={e}
                  onSave={(budget, status) =>
                    setEngagement(e.engagement_id, budget, status)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editable engagement row
// ---------------------------------------------------------------------------
function EngagementRow({
  row,
  onSave,
}: {
  row: EngagementRow;
  onSave: (budget: number | null, status: string) => void;
}) {
  const [budget, setBudget] = useState<string>(
    row.budget != null ? String(row.budget) : ""
  );
  const [status, setStatus] = useState(row.status ?? "active");
  const [dirty, setDirty] = useState(false);

  const handleBudget = (v: string) => { setBudget(v); setDirty(true); };
  const handleStatus = (v: string) => { setStatus(v); setDirty(false); onSave(budget !== "" ? Number(budget) : null, v); };

  return (
    <tr className="group">
      <td className="py-3 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {row.client_name}
      </td>
      <td className="py-3 pr-4 text-gray-800 dark:text-gray-200 font-medium">
        {row.engagement_name}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(ev) => handleBudget(ev.target.value)}
            onBlur={() => {
              if (dirty) {
                setDirty(false);
                onSave(budget !== "" ? Number(budget) : null, status);
              }
            }}
            className="w-36 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
        </div>
      </td>
      <td className="py-3">
        <select
          value={status}
          onChange={(ev) => handleStatus(ev.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Activo</option>
          <option value="closed">Cerrado</option>
          <option value="on_hold">En pausa</option>
        </select>
      </td>
    </tr>
  );
}
