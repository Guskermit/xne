"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "activo" | "cerrado";

export default function StatusCell({
  engagementId,
  initialStatus,
}: {
  engagementId: string;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleChange(newStatus: Status) {
    if (newStatus === status) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("set_engagement_status", {
        p_engagement_id: engagementId,
        p_status: newStatus,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setStatus(newStatus);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <td className="px-4 py-3 whitespace-nowrap" title={errorMsg ?? undefined}>
      <select
        value={status}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as Status)}
        className={`rounded border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
          saving
            ? "opacity-50 cursor-wait"
            : status === "activo"
            ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
            : "border-gray-300 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
        } ${errorMsg ? "border-red-400" : ""}`}
      >
        <option value="activo">Activo</option>
        <option value="cerrado">Cerrado</option>
      </select>
      {errorMsg && (
        <p className="text-xs text-red-500 mt-0.5">{errorMsg}</p>
      )}
    </td>
  );
}
