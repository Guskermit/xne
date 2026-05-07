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
    if (val) {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    router.push(`?${next.toString()}`);
  }

  if (years.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          Fiscal year:
        </span>
        <select
          value={current}
          onChange={(e) => update("fy", e.target.value || null)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              FY{y}
            </option>
          ))}
        </select>
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
