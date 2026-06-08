import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createDb } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  // 1. Verificar que el usuario esté autenticado
  const supabaseUser = await createServerClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Verificar confirmación en el body
  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (body.confirmation !== "borrar cliente") {
    return NextResponse.json({ error: "Confirmación incorrecta" }, { status: 400 });
  }

  // 3. Obtener el clientId de la ruta
  const { clientId } = await params;
  if (!clientId || typeof clientId !== "string" || clientId.trim() === "") {
    return NextResponse.json({ error: "clientId inválido" }, { status: 400 });
  }

  // 4. Ejecutar borrado via conexión directa
  try {
    const db = createDb();
    await db`SELECT public.delete_client_data(${clientId})`;
    await db.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[clear-client] db error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
