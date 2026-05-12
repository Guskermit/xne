"use client";

import { useRef, useState } from "react";
import type { ConflictRow, IntraConflictGroup, IntraExpenseGroup } from "@/app/api/upload/route";

type Stats = {
  total_rows: number;
  time_charges_attempted: number;
  time_charges_inserted: number;
  time_charges_skipped: number;
  time_charges_intra_dupes: number;
  expenses_attempted: number;
  expenses_inserted: number;
  expenses_skipped: number;
  expenses_intra_dupes: number;
};

type UploadResult =
  | { success: true; stats: Stats; conflicts: ConflictRow[]; intraConflicts: IntraConflictGroup[]; intraExpenseConflicts: IntraExpenseGroup[] }
  | { success: false; error: string };

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const hrs = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UploadExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "confirming" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmResult, setConfirmResult] = useState<{ upserted: number } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // intra-Excel conflict resolution: key → selected occurrence index
  const [intraSel, setIntraSel] = useState<Map<string, number>>(new Map());
  const [intraConfirmResult, setIntraConfirmResult] = useState<{ upserted: number } | null>(null);
  const [intraConfirmError, setIntraConfirmError] = useState<string | null>(null);
  const [intraExpSel, setIntraExpSel] = useState<Map<string, number>>(new Map());
  const [intraExpConfirmResult, setIntraExpConfirmResult] = useState<{ upserted: number } | null>(null);
  const [intraExpConfirmError, setIntraExpConfirmError] = useState<string | null>(null);
  const [conflictsDismissed, setConflictsDismissed] = useState(false);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("loading");
    setResult(null);
    setSelected(new Set());
    setConfirmResult(null);
    setConfirmError(null);
    setIntraSel(new Map());
    setIntraConfirmResult(null);
    setIntraConfirmError(null);
    setIntraExpSel(new Map());
    setIntraExpConfirmResult(null);
    setIntraExpConfirmError(null);
    setConflictsDismissed(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data: UploadResult = await res.json();
      setResult(data);
      setStatus(data.success ? "done" : "error");
      if (data.success && data.intraConflicts) {
        const sel = new Map<string, number>();
        for (const g of data.intraConflicts) {
          const k = `${g.engagement_id}|${g.employee_gui}|${g.transaction_date}|${g.activity_code ?? ""}`;
          sel.set(k, g.autoKeptIdx);
        }
        setIntraSel(sel);
      }
      if (data.success && data.intraExpenseConflicts) {
        const sel = new Map<string, number>();
        for (const g of data.intraExpenseConflicts) {
          const k = g.voucher_id
            ? `v:${g.engagement_id}|${g.voucher_id}`
            : `n:${g.engagement_id}|${g.vendor_id ?? ""}|${g.transaction_type_code}|${g.transaction_date ?? ""}|${g.occurrences[g.autoKeptIdx].expense_amount}`;
          sel.set(k, g.autoKeptIdx);
        }
        setIntraExpSel(sel);
      }
    } catch {
      setResult({ success: false, error: "Error de red al subir el fichero" });
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function toggleConflict(idx: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  }

  function toggleAll(conflicts: ConflictRow[]) {
    setSelected((prev) =>
      prev.size === conflicts.length ? new Set() : new Set(conflicts.map((_, i) => i))
    );
  }

  async function handleConfirm(conflicts: ConflictRow[]) {
    const rows = [...selected].map((i) => conflicts[i].incoming);
    if (rows.length === 0) return;
    setStatus("confirming");
    setConfirmError(null);
    try {
      const res = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setConfirmError(data.error ?? "Error desconocido");
        setStatus("done");
      } else {
        setConfirmResult({ upserted: data.upserted });
        setSelected(new Set());
        setStatus("done");
      }
    } catch {
      setConfirmError("Error de red al confirmar");
      setStatus("done");
    }
  }

  const conflicts              = (result?.success && result.conflicts)             ? result.conflicts             : [];
  const intraConflicts         = (result?.success && result.intraConflicts)        ? result.intraConflicts        : [];
  const intraExpenseConflicts  = (result?.success && result.intraExpenseConflicts) ? result.intraExpenseConflicts : [];
  const isBusy = status === "loading" || status === "confirming";

  async function handleIntraExpConfirm() {
    const rows: Record<string, unknown>[] = [];
    for (const g of intraExpenseConflicts) {
      const k = g.voucher_id
        ? `v:${g.engagement_id}|${g.voucher_id}`
        : `n:${g.engagement_id}|${g.vendor_id ?? ""}|${g.transaction_type_code}|${g.transaction_date ?? ""}|${g.occurrences[g.autoKeptIdx].expense_amount}`;
      const idx = intraExpSel.get(k) ?? g.autoKeptIdx;
      rows.push(g.occurrences[idx].row);
    }
    if (rows.length === 0) return;
    setStatus("confirming");
    setIntraExpConfirmError(null);
    try {
      const res = await fetch("/api/upload/confirm-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setIntraExpConfirmError(data.error ?? "Error desconocido");
      } else {
        setIntraExpConfirmResult({ upserted: data.upserted });
      }
    } catch {
      setIntraExpConfirmError("Error de red al confirmar");
    }
    setStatus("done");
 }

  async function handleIntraConfirm() {
    const rows: Record<string, unknown>[] = [];
    for (const g of intraConflicts) {
      const k = `${g.engagement_id}|${g.employee_gui}|${g.transaction_date}|${g.activity_code ?? ""}`;
      const idx = intraSel.get(k) ?? g.autoKeptIdx;
      rows.push(g.occurrences[idx].row);
    }
    if (rows.length === 0) return;
    setStatus("confirming");
    setIntraConfirmError(null);
    try {
      const res = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setIntraConfirmError(data.error ?? "Error desconocido");
      } else {
        setIntraConfirmResult({ upserted: data.upserted });
      }
    } catch {
      setIntraConfirmError("Error de red al confirmar");
    }
    setStatus("done");
  }

  return (
    <section className="w-full max-w-5xl rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Cargar Time &amp; Expense Detail</h2>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0-3 3m3-3 3 3M4.5 19.5h15a1.5 1.5 0 0 0 1.5-1.5V8.25L15.75 3H6A1.5 1.5 0 0 0 4.5 4.5v13.5a1.5 1.5 0 0 0 1.5 1.5Z" />
        </svg>
        <p className="text-sm text-gray-500">
          {status === "loading" || status === "confirming"
            ? "Procesando…"
            : "Arrastra tu fichero .xlsx aquí o haz clic para seleccionar"}
        </p>
        {fileName && status !== "idle" && (
          <p className="text-xs text-gray-400 truncate max-w-xs">{fileName}</p>
        )}
      </div>

      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} disabled={status === "loading" || status === "confirming"} />

      {/* Loading */}
      {(status === "loading" || status === "confirming") && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          {status === "confirming" ? "Guardando selección…" : "Cargando datos en la base de datos…"}
        </div>
      )}

      {/* Resultado exitoso */}
      {status === "done" && result?.success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 text-sm space-y-2">
          <p className="font-semibold text-green-700 dark:text-green-400">✓ Carga completada</p>
          <table className="w-full text-xs text-gray-700 dark:text-gray-300">
            <thead>
              <tr className="text-left font-medium border-b border-green-200 dark:border-green-800">
                <th className="pb-1">Tipo</th>
                <th className="pb-1 text-right">Intentados</th>
                <th className="pb-1 text-right">Nuevos</th>
                <th className="pb-1 text-right">Duplicados</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-0.5">Imputaciones de tiempo</td>
                <td className="text-right">{result.stats.time_charges_attempted}</td>
                <td className="text-right text-green-600 dark:text-green-400">{result.stats.time_charges_inserted}</td>
                <td className="text-right text-amber-600 dark:text-amber-400">{result.stats.time_charges_skipped}</td>
              </tr>
              {result.stats.time_charges_intra_dupes > 0 && (
                <tr className="text-gray-400 dark:text-gray-500 italic">
                  <td className="py-0.5 pl-3">↳ duplicados dentro del Excel (omitidos)</td>
                  <td className="text-right">{result.stats.time_charges_intra_dupes}</td>
                  <td /><td />
                </tr>
              )}
              {result.stats.expenses_intra_dupes > 0 && (
                <tr className="text-gray-400 dark:text-gray-500 italic">
                  <td className="py-0.5 pl-3">↳ duplicados dentro del Excel (omitidos)</td>
                  <td className="text-right">{result.stats.expenses_intra_dupes}</td>
                  <td /><td />
                </tr>
              )}
              <tr>
                <td className="text-right">{result.stats.expenses_attempted}</td>
                <td className="text-right text-green-600 dark:text-green-400">{result.stats.expenses_inserted}</td>
                <td className="text-right text-amber-600 dark:text-amber-400">{result.stats.expenses_skipped}</td>
              </tr>
              <tr className="font-medium border-t border-green-200 dark:border-green-800">
                <td className="pt-1">Total filas</td>
                <td className="text-right pt-1">{result.stats.total_rows}</td>
                <td /><td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Intra-Excel expense conflict resolution */}
      {status === "done" && intraExpenseConflicts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">
              ⚠ {intraExpenseConflicts.length} gasto(s) duplicado(s) dentro del Excel con valores distintos — elige cuál conservar
            </h3>
            <p className="text-xs text-gray-400">Clave: engagement · proveedor · tipo · fecha · importe</p>
          </div>

          {intraExpenseConflicts.map((g, gi) => {
            const k = g.voucher_id
              ? `v:${g.engagement_id}|${g.voucher_id}`
              : `n:${g.engagement_id}|${g.vendor_id ?? ""}|${g.transaction_type_code}|${g.transaction_date ?? ""}|${g.occurrences[g.autoKeptIdx].expense_amount}`;
            const sel = intraExpSel.get(k) ?? g.autoKeptIdx;
            return (
              <div key={gi} className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 overflow-hidden">
                <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-orange-800 dark:text-orange-300">
                  <span className="font-mono">{g.engagement_id}</span>
                  <span>{g.transaction_type_code}</span>
                  {g.transaction_date && <span>{fmtDate(g.transaction_date)}</span>}
                  {g.voucher_id && <span>Voucher: {g.voucher_id}</span>}
                  {g.vendor_id && <span>Vendor: {g.vendor_id}</span>}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-orange-200 dark:border-orange-800 text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-1.5 text-left font-medium">FILA</th>
                      <th className="px-4 py-1.5 text-right font-medium">IMPORTE</th>
                      <th className="px-4 py-1.5 text-left font-medium">DESCRIPCIÓN</th>
                      <th className="px-4 py-1.5 text-right font-medium">FECHA CONTABLE</th>
                      <th className="px-4 py-1.5 text-center font-medium">USAR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.occurrences.map((occ, oi) => {
                      const checked = sel === oi;
                      return (
                        <tr key={oi} className={`border-b border-orange-100 dark:border-orange-900 ${checked ? "bg-orange-100 dark:bg-orange-900/50" : ""}` }>
                          <td className="px-4 py-1.5 font-mono">
                            #{occ.idx}
                            {oi === g.autoKeptIdx && (
                              <span className="ml-1 text-[10px] bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-300 rounded px-1">auto</span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-right font-semibold">{eur.format(occ.expense_amount)}</td>
                          <td className="px-4 py-1.5 text-gray-600 dark:text-gray-400 max-w-xs truncate">{occ.expense_description ?? "—"}</td>
                          <td className="px-4 py-1.5 text-right">{fmtDate(occ.accounting_date)}</td>
                          <td className="px-4 py-1.5 text-center">
                            <input
                              type="radio"
                              name={`exp-${gi}`}
                              checked={checked}
                              onChange={() => setIntraExpSel((prev) => new Map(prev).set(k, oi))}
                              className="accent-orange-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {intraExpConfirmResult && (
            <p className="text-xs text-green-600 dark:text-green-400">✓ {intraExpConfirmResult.upserted} gasto(s) actualizado(s)</p>
          )}
          {intraExpConfirmError && (
            <p className="text-xs text-red-600 dark:text-red-400">✗ {intraExpConfirmError}</p>
          )}

          <button
            onClick={handleIntraExpConfirm}
            disabled={isBusy}
            className="self-start rounded-md bg-orange-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Aplicar selección de gastos
          </button>
        </div>
      )}

      {/* 🟣 Conflictos intra-Excel: imputaciones de tiempo */}
      {status === "done" && intraConflicts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400">
            ⚠ {intraConflicts.length} imputación(es) duplicada(s) dentro del Excel con valores distintos — elige cuál conservar
          </h3>

          {intraConflicts.map((g, gi) => {
            const k = `${g.engagement_id}|${g.employee_gui}|${g.transaction_date}|${g.activity_code ?? ""}`;
            const sel = intraSel.get(k) ?? g.autoKeptIdx;
            return (
              <div key={gi} className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 overflow-hidden">
                <div className="px-4 py-2 bg-purple-100 dark:bg-purple-900 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-purple-800 dark:text-purple-300">
                  <span>{g.employee_name ?? g.employee_gui}</span>
                  <span className="font-mono">{g.engagement_id}</span>
                  <span>{fmtDate(g.transaction_date)}</span>
                  {g.activity_code && <span>{g.activity_code}</span>}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-purple-200 dark:border-purple-800 text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-1.5 text-left font-medium">FILA</th>
                      <th className="px-4 py-1.5 text-right font-medium">HORAS</th>
                      <th className="px-4 py-1.5 text-right font-medium">ANSR</th>
                      <th className="px-4 py-1.5 text-right font-medium">FECHA CONTABLE</th>
                      <th className="px-4 py-1.5 text-center font-medium">USAR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.occurrences.map((occ, oi) => {
                      const checked = sel === oi;
                      return (
                        <tr key={oi} className={`border-b border-purple-100 dark:border-purple-900 ${checked ? "bg-purple-100 dark:bg-purple-900/50" : ""}`}>
                          <td className="px-4 py-1.5 font-mono">
                            #{occ.idx}
                            {oi === g.autoKeptIdx && (
                              <span className="ml-1 text-[10px] bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded px-1">auto</span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-right">{occ.charged_hours != null ? hrs.format(occ.charged_hours) : "—"}</td>
                          <td className="px-4 py-1.5 text-right">{occ.ansr_revenue != null ? eur.format(occ.ansr_revenue) : "—"}</td>
                          <td className="px-4 py-1.5 text-right">{fmtDate(occ.accounting_date)}</td>
                          <td className="px-4 py-1.5 text-center">
                            <input
                              type="radio"
                              name={`time-${gi}`}
                              checked={checked}
                              onChange={() => setIntraSel((prev) => new Map(prev).set(k, oi))}
                              className="accent-purple-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {intraConfirmResult && (
            <p className="text-xs text-green-600 dark:text-green-400">✓ {intraConfirmResult.upserted} imputación(es) actualizada(s)</p>
          )}
          {intraConfirmError && (
            <p className="text-xs text-red-600 dark:text-red-400">✗ {intraConfirmError}</p>
          )}

          <button
            onClick={handleIntraConfirm}
            disabled={isBusy}
            className="self-start rounded-md bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Aplicar selección de horas
          </button>
        </div>
      )}

      {/* 🟡 Conflictos con BD: imputaciones de tiempo */}
      {status === "done" && conflicts.length > 0 && !conflictsDismissed && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              ⚠ {conflicts.length} imputación(es) ya existen en BD con valores distintos
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setConflictsDismissed(true)}
                title="Ignorar los conflictos y mantener los datos que ya hay en base de datos"
                className="rounded-md border border-amber-400 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900"
              >
                Descartar — mantener BD
              </button>
              <button
                onClick={() => toggleAll(conflicts)}
                className="rounded-md border border-amber-400 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900"
              >
                {selected.size === conflicts.length ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {conflicts.map((c, i) => {
              const checked = selected.has(i);
              return (
                <div
                  key={i}
                  onClick={() => toggleConflict(i)}
                  className={`rounded-lg border p-3 cursor-pointer text-xs transition-colors ${
                    checked
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                      : "border-gray-200 dark:border-gray-700 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <input type="checkbox" checked={checked} readOnly className="accent-amber-500" />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {c.employee_name ?? c.employee_gui} — {c.engagement_id}
                    </span>
                    <span className="text-gray-500">{fmtDate(c.transaction_date)}</span>
                    {c.activity_code && <span className="text-gray-400">{c.activity_code}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 pl-5 text-gray-600 dark:text-gray-400">
                    <span>BD: {c.existing.charged_hours != null ? hrs.format(c.existing.charged_hours) : "—"} h / {c.existing.ansr_revenue != null ? eur.format(c.existing.ansr_revenue) : "—"}</span>
                    <span>Excel: {(c.incoming.charged_hours as number | null) != null ? hrs.format(c.incoming.charged_hours as number) : "—"} h / {(c.incoming.ansr_revenue as number | null) != null ? eur.format(c.incoming.ansr_revenue as number) : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {confirmResult && (
            <p className="text-xs text-green-600 dark:text-green-400">✓ {confirmResult.upserted} imputación(es) sobrescrita(s)</p>
          )}
          {confirmError && (
            <p className="text-xs text-red-600 dark:text-red-400">✗ {confirmError}</p>
          )}

          <button
            onClick={() => handleConfirm(conflicts)}
            disabled={selected.size === 0 || isBusy}
            className="self-start rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Sobrescribir{selected.size > 0 ? ` (${selected.size})` : ""} seleccionadas
          </button>
        </div>
      )}

      {/* Error */}
      {status === "error" && result && !result.success && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          ✗ {result.error}
        </div>
      )}
    </section>
  );
}
