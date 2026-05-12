import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  // En Docker, SUPABASE_INTERNAL_URL apunta a host.docker.internal para que
  // el servidor pueda alcanzar Supabase local. El navegador sigue usando
  // NEXT_PUBLIC_SUPABASE_URL (localhost).
  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` was called from a Server Component.
            // Safe to ignore if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
