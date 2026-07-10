"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  years: number[];
};

export default function FiscalYearSelector({ years }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("fy") ?? "";
  const activeOnly = params.get("active") === "1";

  function update(key: string, val: string | null) {
    const next = new URLSearchParams(params.toString());
    if (val) next.set(key, val);
    else next.delete(key);
    router.push(`?${next.toString()}`);
  }

  if (years.length === 0) return null;

  const options = [{ value: "", label: "Todos" }, ...years.map((y) => ({ value: String(y), label: `FY${y}` }))];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Selector tipo botones — igual que BusinessUnitSelector */}
      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
        {options.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => update("fy", opt.value || null)}
              className={`px-4 py-1.5 font-medium transition-colors whitespace-nowrap ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => update("active", e.target.checked ? "1" : null)}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          Solo activos
        </span>
      </label>
    </div>
  );
}
