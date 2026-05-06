import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../(auth)/actions";
import UploadExcel from "./UploadExcel";
import ProjectKpis from "./ProjectKpis";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8 pt-16">
      <div className="flex w-full max-w-7xl items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{user.email}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
          >
            Cerrar sesión
          </button>
        </form>
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-7xl space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-4 h-20 animate-pulse"
                />
              ))}
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 h-48 animate-pulse bg-gray-100 dark:bg-gray-800" />
          </div>
        }
      >
        <ProjectKpis />
      </Suspense>

      <UploadExcel />
    </main>
  );
}
