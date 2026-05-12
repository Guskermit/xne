import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { rows: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No hay filas que confirmar" }, { status: 400 });
  }

  try {
    const db = createDb();
    let upserted = 0;
    for (const row of body.rows as Record<string, unknown>[]) {
      // Delete existing row matching the natural key, then insert fresh.
      // For expenses with voucher_id use that as the key; otherwise use
      // engagement + vendor + type + date + amount.
      if (row.voucher_id) {
        await db`
          DELETE FROM te.fact_expense
          WHERE engagement_id                    = ${row.engagement_id as string}
            AND voucher_id                       = ${row.voucher_id as string}
            AND expense_amount                   = ${row.expense_amount as number}
            AND coalesce(expense_description,'') = ${(row.expense_description as string) ?? ""}
        `;
      } else {
        await db`
          DELETE FROM te.fact_expense
          WHERE engagement_id                        = ${row.engagement_id as string}
            AND coalesce(vendor_id,'')               = ${(row.vendor_id as string) ?? ""}
            AND transaction_type_code                = ${row.transaction_type_code as string}
            AND transaction_date::text               = ${(row.transaction_date as string) ?? ""}
            AND expense_amount                       = ${row.expense_amount as number}
            AND coalesce(accounting_date::text,'')   = ${(row.accounting_date as string) ?? ""}
            AND coalesce(expense_description,'')     = ${(row.expense_description as string) ?? ""}
        `;
      }
      await db`
        INSERT INTO te.fact_expense (
          engagement_id, vendor_id, account_id, transaction_type_code,
          employee_gui, transaction_date, accounting_date, week_ending_date,
          expense_amount, expense_description, origin, destination,
          trip_id, journal_id, voucher_id, activity_code, category_code
        ) VALUES (
          ${row.engagement_id as string},
          ${(row.vendor_id as string | null) ?? null},
          ${(row.account_id as string | null) ?? null},
          ${row.transaction_type_code as string},
          ${(row.employee_gui as string | null) ?? null},
          ${(row.transaction_date as string | null) ?? null},
          ${(row.accounting_date as string | null) ?? null},
          ${(row.week_ending_date as string | null) ?? null},
          ${row.expense_amount as number},
          ${(row.expense_description as string | null) ?? null},
          ${(row.origin as string | null) ?? null},
          ${(row.destination as string | null) ?? null},
          ${(row.trip_id as string | null) ?? null},
          ${(row.journal_id as string | null) ?? null},
          ${(row.voucher_id as string | null) ?? null},
          ${(row.activity_code as string | null) ?? null},
          ${(row.category_code as string | null) ?? null}
        )
      `;
      upserted++;
    }
    await db.end();
    return NextResponse.json({ success: true, upserted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[upload/confirm-expense]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
