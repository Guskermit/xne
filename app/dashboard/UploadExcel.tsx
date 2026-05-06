"use client";

import { useRef, useState } from "react";

type Stats = {
  total_rows: number;
  time_charges_attempted: number;
  time_charges_inserted: number;
  time_charges_skipped: number;
  expenses_attempted: number;
  expenses_inserted: number;
  expenses_skipped: number;
};

type UploadResult =
  | { success: true; stats: Stats }
  | { success: false; error: string };

export default function UploadExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setStatus("loading");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data: UploadResult = await res.json();
      setResult(data);
      setStatus(data.success ? "done" : "error");
    } catch {
      setResult({ success: false, error: "Error de red al subir el fichero" });
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset para permitir volver a subir el mismo fichero
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <section className="w-full max-w-xl rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Cargar Time &amp; Expense Detail</h2>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16v-8m0 0-3 3m3-3 3 3M4.5 19.5h15a1.5 1.5 0 0 0 1.5-1.5V8.25L15.75 3H6A1.5 1.5 0 0 0 4.5 4.5v13.5a1.5 1.5 0 0 0 1.5 1.5Z"
          />
        </svg>
        <p className="text-sm text-gray-500">
          {status === "loading"
            ? "Procesando…"
            : "Arrastra tu fichero .xlsx aquí o haz clic para seleccionar"}
        </p>
        {fileName && status !== "idle" && (
          <p className="text-xs text-gray-400 truncate max-w-xs">{fileName}</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onInputChange}
        disabled={status === "loading"}
      />

      {/* Loading */}
      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          Cargando datos en la base de datos…
        </div>
      )}

      {/* Resultado exitoso */}
      {status === "done" && result?.success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 text-sm space-y-2">
          <p className="font-semibold text-green-700 dark:text-green-400">
            ✓ Carga completada
          </p>
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
                <td className="text-right text-green-600 dark:text-green-400">
                  {result.stats.time_charges_inserted}
                </td>
                <td className="text-right text-amber-600 dark:text-amber-400">
                  {result.stats.time_charges_skipped}
                </td>
              </tr>
              <tr>
                <td className="py-0.5">Gastos</td>
                <td className="text-right">{result.stats.expenses_attempted}</td>
                <td className="text-right text-green-600 dark:text-green-400">
                  {result.stats.expenses_inserted}
                </td>
                <td className="text-right text-amber-600 dark:text-amber-400">
                  {result.stats.expenses_skipped}
                </td>
              </tr>
              <tr className="font-medium border-t border-green-200 dark:border-green-800">
                <td className="pt-1">Total filas</td>
                <td className="text-right pt-1">{result.stats.total_rows}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Error */}
      {status === "error" && result && !result.success && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          <p className="font-semibold">Error al cargar</p>
          <p>{result.error}</p>
        </div>
      )}
    </section>
  );
}
