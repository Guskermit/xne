import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Bienvenido a xne</h1>
      <p className="text-gray-500">Next.js + Supabase + Vercel</p>
      <div className="flex gap-4">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
          >
            Ir al dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-md border border-gray-300 px-4 py-2"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              Crear cuenta
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
