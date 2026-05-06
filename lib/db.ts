import postgres from "postgres";

export function createDb() {
  const dsn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dsn) throw new Error("DATABASE_URL no está configurada en .env.local");
  return postgres(dsn, { max: 1, idle_timeout: 20 });
}
