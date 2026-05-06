"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function parseAmount(raw: string): number | null {
  let str = raw.trim().replace(/[€\s]/g, "");
  if (!str) return null;
  const lastDot = str.lastIndexOf(".");
  const lastComma = str.lastIndexOf(",");
  if (lastComma > lastDot) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else {
    str = str.replace(/,/g, "");
  }
  const n = Number(str);
  return isNaN(n) ? null : n;
}

export default function BudgetCell({
  engagementId,
  initialBudget,
}: {
  engagementId: string;
  initialBudget: number | null;
}) {
  const [budget, setBudget] = useState<number | null>(initialBudget);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setInputVal(budget != null ? String(budget) : "");
    setEditing(true);
    setError(false);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    const parsed = parseAmount(inputVal);
    if (parsed === null && inputVal.trim() !== "") {
      setError(true);
      return;
    }
    const newBudget = inputVal.trim() === "" ? null : parsed;
    setSaving(true);
    setEditing(false);
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("set_engagement_budget", {
        p_engagement_id: engagementId,
        p_budget: newBudget,
      });
      if (rpcErr) throw rpcErr;
      setBudget(newBudget);
    } catch {
      setError(true);
      setEditing(true);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setEditing(false);
      setError(false);
    }
  }

  if (editing) {
    return (
      <td className="px-2 py-2 text-right">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setError(false); }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className={`w-28 rounded border px-2 py-1 text-right text-sm tabular-nums bg-white dark:bg-gray-900 outline-none
            ${error
              ? "border-red-400 focus:ring-red-400"
              : "border-blue-400 focus:ring-2 focus:ring-blue-400"
            }`}
          placeholder="0"
          autoFocus
        />
      </td>
    );
  }

  return (
    <td
      className={`px-4 py-3 text-right tabular-nums cursor-pointer select-none group relative
        ${saving ? "opacity-50" : ""}
        ${error ? "text-red-500" : "text-gray-700 dark:text-gray-300"}
      `}
      onClick={startEdit}
      title="Haz clic para editar el presupuesto"
    >
      {saving ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
      ) : budget != null ? (
        <>
          {eur.format(budget)}
          <span className="ml-1 opacity-0 group-hover:opacity-100 text-gray-400 text-xs">✎</span>
        </>
      ) : (
        <span className="text-gray-300 dark:text-gray-600 group-hover:text-blue-400 transition-colors text-xs">
          + presupuesto
        </span>
      )}
    </td>
  );
}
