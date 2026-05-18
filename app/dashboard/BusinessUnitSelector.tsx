"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "",            label: "Todos" },
  { value: "Studio+",     label: "Studio+" },
  { value: "Hospitality", label: "Hospitality" },
] as const;

export default function BusinessUnitSelector() {
  const router      = useRouter();
  const params      = useSearchParams();
  const current     = params.get("bu") ?? "";

  function select(val: string) {
    const next = new URLSearchParams(params.toString());
    if (val) next.set("bu", val);
    else next.delete("bu");
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
      {OPTIONS.map((opt) => {
        const active = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => select(opt.value)}
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
  );
}
