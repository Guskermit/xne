"use client";

import { useRef, useState } from "react";

const CONFIRMATION_PHRASE = "borrar cliente";

type State = "idle" | "open" | "loading" | "done" | "error";

export default function ClearClientDataButton({
  clientId,
  clientName,
  onCleared,
}: {
  clientId: string;
  clientName: string;
  onCleared?: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [input, setInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function open() {
    setInput("");
    setErrorMsg("");
    setState("open");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function close() {
    if (state === "loading") return;
    setState("idle");
    setInput("");
    setErrorMsg("");
  }

  async function confirm() {
    if (input !== CONFIRMATION_PHRASE) {
      setErrorMsg(`Debes escribir exactamente "${CONFIRMATION_PHRASE}"`);
      inputRef.current?.focus();
      return;
    }
    setState("loading");
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setState("done");
      onCleared?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
      setState("error");
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") close();
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={open}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
      >
        Eliminar datos del cliente
      </button>

      {/* Modal backdrop */}
      {state !== "idle" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6 mx-4 space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Eliminar datos del cliente
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Esta acción eliminará <strong>todos los datos</strong> del
                  cliente{" "}
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {clientName}
                  </span>{" "}
                  (imputaciones, gastos, engagements, proyectos y oportunidades).
                  No se puede deshacer.
                </p>
              </div>
              <button
                onClick={close}
                disabled={state === "loading"}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none mt-0.5 disabled:opacity-30"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {state !== "done" ? (
              <>
                {/* Confirmation input */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Escribe{" "}
                    <span className="font-mono font-bold text-red-600 dark:text-red-400">
                      {CONFIRMATION_PHRASE}
                    </span>{" "}
                    para confirmar
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setErrorMsg(""); }}
                    onKeyDown={onKeyDown}
                    disabled={state === "loading"}
                    placeholder={CONFIRMATION_PHRASE}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors
                      bg-white dark:bg-gray-800
                      ${errorMsg
                        ? "border-red-400 focus:ring-2 focus:ring-red-300"
                        : "border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-400"
                      }
                      text-gray-900 dark:text-gray-100 disabled:opacity-50`}
                  />
                  {errorMsg && (
                    <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={close}
                    disabled={state === "loading"}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirm}
                    disabled={state === "loading" || input !== CONFIRMATION_PHRASE}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    {state === "loading" ? "Eliminando…" : "Eliminar"}
                  </button>
                </div>
              </>
            ) : (
              /* Success state */
              <div className="space-y-4">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                  Los datos del cliente <strong>{clientName}</strong> han sido eliminados.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={close}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
