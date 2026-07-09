"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ForecastUploadResult, ForecastUploadStats } from "@/app/api/upload-forecast/route";

const fmtNum = new Intl.NumberFormat("es-ES");

export default function UploadForecast() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus]         = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult]         = useState<ForecastUploadResult | null>(null);
  const [fileName, setFileName]     = useState<string | null>(null);
  const [clearing, setClearing]     = useState(false);
  const [clearMsg, setClearMsg]     = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("loading");
    setResult(null);
    setClearMsg(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res  = await fetch("/api/upload-forecast", { method: "POST", body: fd });
      const data: ForecastUploadResult = await res.json();
      setResult(data);
      setStatus(data.success ? "done" : "error");
    } catch (err) {
      setResult({ success: false, error: String(err) });
      setStatus("error");
    }
  }

  async function handleClear() {
    if (!confirm("¿Borrar todos los datos de forecast? Las imputaciones reales no se tocarán.")) return;
    setClearing(true);
    setClearMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("delete_forecast_data");
      if (error) throw error;
      setClearMsg("Forecast borrado. Ahora puedes re-subir el Excel.");
      setResult(null);
      setStatus("idle");
      setFileName(null);
    } catch (err: any) {
      setClearMsg(`Error al borrar: ${err.message ?? String(err)}`);
    } finally {
      setClearing(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone / button */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 rounded-lg border border-dashed border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 px-4 py-3 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
      >
        {/* Icon */}
        <svg
          className="h-5 w-5 shrink-0 text-orange-500 dark:text-orange-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 019.75 19.875V8.625zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0116.5 19.875V4.125z"
          />
        </svg>

        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
            Subir Forecast de Horas
          </span>
          <span className="text-xs text-orange-500 dark:text-orange-500 truncate">
            {status === "loading"
              ? `Procesando ${fileName}…`
              : fileName && status === "done"
              ? fileName
              : "Horas y % Utilización por Recurso y Proyecto (.xlsx)"}
          </span>
        </div>

        {status === "loading" && (
          <span className="ml-auto inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Limpiar forecast */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleClear}
          disabled={clearing}
          className="text-xs text-red-500 dark:text-red-400 hover:underline disabled:opacity-50"
        >
          {clearing ? "Borrando…" : "Limpiar datos de forecast"}
        </button>
        {clearMsg && (
          <span className={`text-xs ${clearMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
            {clearMsg}
          </span>
        )}
      </div>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result.success
              ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
              : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
          }`}
        >
          {result.success ? (
            <StatsPanel stats={result.stats} />
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatsPanel({ stats }: { stats: ForecastUploadStats }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <Stat label="Filas cargadas" value={fmtNum.format(stats.rows_upserted)} />
      <Stat label="Semanas"        value={fmtNum.format(stats.weeks)} />
      <Stat label="Empleados"      value={fmtNum.format(stats.employees)} />
      <Stat label="Engagements"    value={fmtNum.format(stats.engagements)} />
      {stats.intra_dupes > 0 && (
        <Stat
          label="Duplicados descartados"
          value={fmtNum.format(stats.intra_dupes)}
          warn
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <span className={warn ? "text-yellow-700 dark:text-yellow-400" : ""}>
      <span className="font-semibold">{value}</span>{" "}
      <span className="text-xs opacity-70">{label}</span>
    </span>
  );
}
