import { Suspense } from "react";
import AdminPanel from "./AdminPanel";

export default function AdminPage() {
  return (
    <main className="flex flex-col items-center gap-8 p-8 pt-10">
      <div className="w-full max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Configuración
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          Ajusta colores, presupuestos y estado de los engagements.
        </p>
        <Suspense
          fallback={
            <div className="h-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
          }
        >
          <AdminPanel />
        </Suspense>
      </div>
    </main>
  );
}
