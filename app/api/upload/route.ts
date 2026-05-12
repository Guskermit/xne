import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createDb } from "@/lib/db";

export type IntraExpenseGroup = {
  engagement_id: string;
  transaction_date: string | null;
  transaction_type_code: string;
  vendor_id: string | null;
  voucher_id: string | null;
  autoKeptIdx: number;
  occurrences: Array<{
    idx: number;
    expense_amount: number;
    expense_description: string | null;
    accounting_date: string | null;
    row: Record<string, unknown>;
  }>;
};

export type IntraConflictGroup = {
  employee_name: string | null;
  employee_gui: string;
  engagement_id: string;
  transaction_date: string;
  activity_code: string | null;
  autoKeptIdx: number;
  occurrences: Array<{
    idx: number;
    charged_hours: number | null;
    ansr_revenue: number | null;
    accounting_date: string | null;
    row: Record<string, unknown>;
  }>;
};

export type ConflictRow = {
  employee_name: string | null;
  employee_gui: string;
  engagement_id: string;
  transaction_date: string;
  activity_code: string | null;
  existing: {
    id: number;
    charged_hours: number | null;
    ansr_revenue: number | null;
    accounting_date: string | null;
  };
  incoming: Record<string, unknown>;
};

const SHEET_NAME = "Detail";
const HEADER_ROW_IDX_DEFAULT = 7; // 0-based → fila 8 en Excel (fallback)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function s(v: unknown): string | null {
  if (v == null || v === "") return null;
  const str = String(v).trim();
  return str || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  // xlsx con raw:true devuelve JS numbers directamente → path rápido
  if (typeof v === "number") return isNaN(v) ? null : v;
  let str = String(v).trim().replace(/[€$\s]/g, "");
  if (!str) return null;
  // Notación contable: (1.234,56) → -1234.56
  let sign = 1;
  if (str.startsWith("(") && str.endsWith(")")) {
    sign = -1;
    str = str.slice(1, -1).trim();
  }
  // Detectar separador decimal: el que aparece más a la derecha es el decimal
  const lastDot   = str.lastIndexOf(".");
  const lastComma = str.lastIndexOf(",");
  if (lastComma > lastDot) {
    // Formato europeo: "1.234,56" → "1234.56"
    str = str.replace(/\./g, "").replace(",", ".");
  } else {
    // Formato anglosajón: "1,234.56" → "1234.56"
    str = str.replace(/,/g, "");
  }
  const n = Number(str);
  return isNaN(n) ? null : sign * n;
}

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return v.toISOString().split("T")[0];
  }
  if (typeof v === "number") {
    // Excel date serial: xlsx con cellDates:false devuelve número
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const str = String(v).trim();
  return str || null;
}

function splitNameId(v: unknown): [string | null, string | null] {
  if (!v) return [null, null];
  const str = String(v).trim();
  const m = str.match(/^(.*?)[\s\-]+([A-Za-z0-9]+)\s*$/);
  if (m) return [m[1].trim(), m[2].trim()];
  return [str, null];
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Verificar autenticación
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Leer el fichero del formulario
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Error leyendo el formulario" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No se recibió ningún fichero" }, { status: 400 });
  }

  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El fichero supera el límite de 50 MB" }, { status: 400 });
  }

  // 3. Parsear Excel
  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "Fichero Excel inválido" }, { status: 400 });
  }

  const ws = workbook.Sheets[SHEET_NAME];
  if (!ws) {
    return NextResponse.json(
      { error: `Hoja "${SHEET_NAME}" no encontrada. Asegúrate de cargar el export Time & Expense Detail.` },
      { status: 400 }
    );
  }

  const sheetData = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,    // devuelve números como JS numbers, no como strings formateados
  });

  if (sheetData.length <= HEADER_ROW_IDX_DEFAULT) {
    return NextResponse.json({ error: "El fichero no contiene datos suficientes" }, { status: 400 });
  }

  // Auto-detectar la fila de encabezados buscando la que contiene "Engagement ID"
  let HEADER_ROW_IDX = HEADER_ROW_IDX_DEFAULT;
  for (let i = 0; i < Math.min(sheetData.length, 20); i++) {
    const row = sheetData[i] as unknown[];
    if (row.some((cell) => cell != null && String(cell).trim() === "Engagement ID")) {
      HEADER_ROW_IDX = i;
      break;
    }
  }
  console.log(`[upload] Hoja "${SHEET_NAME}" - fila de encabezados detectada: ${HEADER_ROW_IDX + 1} (0-based: ${HEADER_ROW_IDX})`);

  const rawHeaders = sheetData[HEADER_ROW_IDX] as unknown[];
  const headers = rawHeaders.map((h) => (h ? String(h).trim() : ""));

  const rows: Row[] = [];
  for (let i = HEADER_ROW_IDX + 1; i < sheetData.length; i++) {
    const rowArr = sheetData[i] as unknown[];
    const rec: Row = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = rowArr[idx] ?? null;
    });
    // Saltar filas vacías / subtotales
    if (!s(rec["Engagement ID"])) continue;
    if (
      !s(rec["Transaction Type"]) &&
      rec["Charged Hours / Tech Quantity"] == null &&
      rec["Expense Amount"] == null
    )
      continue;
    rows.push(rec);
  }

  if (rows.length === 0) {
    const detectedHeaders = headers.filter(Boolean).slice(0, 10).join(", ");
    return NextResponse.json(
      {
        error: `No se encontraron filas de datos (fila de encabezados detectada: ${HEADER_ROW_IDX + 1}). Columnas encontradas: ${detectedHeaders || "ninguna"}`,
      },
      { status: 400 }
    );
  }

  // ------------------------------------------------------------------
  // 4. Recolectar dimensiones únicas
  // ------------------------------------------------------------------
  try {
    const clients = new Map<string, string | null>();
    const opps = new Map<string, { name: string | null; client_id: string | null }>();
    const projects = new Map<string, { name: string | null; opp_id: string | null }>();
    const engagements = new Map<
      string,
      { name: string | null; project_id: string | null; service_line: string | null; country: string | null }
    >();
    const employees = new Map<
      string,
      {
        name: string | null;
        gds: string | null;
        cost_center: string | null;
        region: string | null;
        bu: string | null;
        rank: string | null;
        grade: string | null;
      }
    >();
    const vendors = new Map<string, string | null>();
    const accounts = new Map<string, string | null>();
    const activities = new Map<string, string | null>();
    const categories = new Map<string, { desc: string | null; sub: string | null }>();
    const transactionTypes = new Set<string>();
    const ranks = new Set<string>();
    const grades = new Set<string>();

    for (const r of rows) {
      const cid = s(r["Client ID"]);
      if (cid) clients.set(cid, s(r["Client Name"]));

      const oid = s(r["Opportunity ID"]);
      if (oid) opps.set(oid, { name: s(r["Opportunity Name"]), client_id: cid });

      const pid = s(r["Project ID"]);
      if (pid) projects.set(pid, { name: s(r["Project Name"]), opp_id: oid });

      const eid = s(r["Engagement ID"])!;
      engagements.set(eid, {
        name: s(r["Engagement Name"]),
        project_id: pid,
        service_line: s(r["Service Line"]),
        country: s(r["Country / Region"]),
      });

      const gui = s(r["Employee GUI / Tech Product ID"]);
      if (gui) {
        const rank = s(r["Rank / Method"]);
        const grade = s(r["Grade"]);
        if (rank) ranks.add(rank);
        if (grade) grades.add(grade);
        employees.set(gui, {
          name: s(r["Employee / Tech Product Name"]),
          gds: s(r["GDS"]),
          cost_center: s(r["Cost Center"]) ?? s(r["Cost Center "]), // encabezado con espacio al final
          region: s(r["Employee Region"]),
          bu: s(r["Employee Business Unit"]),
          rank,
          grade,
        });
      }

      const [vname, vid] = splitNameId(r["Vendor Name / ID"]);
      if (vid) vendors.set(vid, vname);

      const [aname, aid] = splitNameId(r["Account Name / ID"]);
      if (aid) accounts.set(aid, aname);

      const ac = s(r["Activity Code"]);
      if (ac) activities.set(ac, s(r["Activity Code Description"]));

      const cc = s(r["Category Code"]);
      if (cc)
        categories.set(cc, {
          desc: s(r["Category Code Description"]),
          sub: s(r["Sub Category Description"]),
        });

      const tt = s(r["Transaction Type"]);
      if (tt) transactionTypes.add(tt);
    }

    // ------------------------------------------------------------------
    // 5. Preparar filas de hechos
    // ------------------------------------------------------------------
    type TimeRow = {
      engagement_id: string;
      employee_gui: string;
      rank_code: string | null;
      grade: string | null;
      transaction_date: string | null;
      accounting_date: string | null;
      week_ending_date: string | null;
      charged_hours: number | null;
      nsr_revenue: number | null;
      eaf_reserve_allocation: number | null;
      ansr_revenue: number | null;
      labor_cost: number | null;
      labor_cost_rate: number | null;
      tech_uplift_cost: number | null;
      tech_product_cost: number | null;
      tech_product_cost_rate: number | null;
      margin_cost: number | null;
      margin_cost_rate: number | null;
      rate_card_rate: number | null;
      rate_card_amount: number | null;
      activity_code: string | null;
      transaction_type_code: string;
      relieved_flag: boolean;
    };

    type ExpenseRow = {
      engagement_id: string;
      vendor_id: string | null;
      account_id: string | null;
      transaction_type_code: string;
      employee_gui: string | null;
      transaction_date: string | null;
      accounting_date: string | null;
      week_ending_date: string | null;
      expense_amount: number;
      expense_description: string | null;
      origin: string | null;
      destination: string | null;
      trip_id: string | null;
      journal_id: string | null;
      voucher_id: string | null;
      activity_code: string | null;
      category_code: string | null;
    };

    const timeRows: TimeRow[] = [];
    const expenseRows: ExpenseRow[] = [];

    for (const r of rows) {
      const tt = s(r["Transaction Type"]);
      const hours = num(r["Charged Hours / Tech Quantity"]);
      const amount = num(r["Expense Amount"]);
      const eng = s(r["Engagement ID"])!;
      const gui = s(r["Employee GUI / Tech Product ID"]);
      const txDate = toDate(r["Transaction Date"]);
      const acDate = toDate(r["Accounting Date"]);
      const wkDate = toDate(r["Week Ending Date"]);
      const activity = s(r["Activity Code"]);

      if (tt === "Labor" || hours != null) {
        timeRows.push({
          engagement_id: eng,
          employee_gui: gui ?? "000000000",
          rank_code: s(r["Rank / Method"]),
          grade: s(r["Grade"]),
          transaction_date: txDate,
          accounting_date: acDate,
          week_ending_date: wkDate,
          charged_hours: hours,
          nsr_revenue: num(r["NSR / Tech Revenue"]),
          eaf_reserve_allocation: num(r["EAF Reserve Allocation"]),
          ansr_revenue: num(r["ANSR / Tech Revenue"]),
          labor_cost: num(r["Labor Cost"]),
          labor_cost_rate: num(r["Labor Cost Rate"]),
          tech_uplift_cost: num(r["Tech Uplift Cost"]),
          tech_product_cost: num(r["Tech Product Cost"]),
          tech_product_cost_rate: num(r["Tech Product Cost Rate"]),
          margin_cost: num(r["Margin Cost"]),
          margin_cost_rate: num(r["Margin Cost Rate"]),
          rate_card_rate: num(r["Rate Card Rate"]),
          rate_card_amount: num(r["Rate Card Amount"]),
          activity_code: activity,
          transaction_type_code: "Labor",
          relieved_flag: Boolean(r["Relieved Flag"]),
        });
      } else if (amount != null) {
        const [, vid] = splitNameId(r["Vendor Name / ID"]);
        const [, aid] = splitNameId(r["Account Name / ID"]);
        expenseRows.push({
          engagement_id: eng,
          vendor_id: vid,
          account_id: aid,
          transaction_type_code: tt ?? "AP (FB60 Solution) Expense",
          employee_gui: gui && gui !== "000000000" ? gui : null,
          transaction_date: txDate,
          accounting_date: acDate,
          week_ending_date: wkDate,
          expense_amount: amount,
          expense_description: s(r["Expense Description"]),
          origin: s(r["From / Origin"]) ?? s(r["From / Origin "]),
          destination: s(r["To / Destination"]),
          trip_id: s(r["Trip ID"]),
          journal_id: s(r["Journal ID"]),
          voucher_id: s(r["Voucher ID"]),
          activity_code: activity,
          category_code: s(r["Category Code"]),
        });
      }
    }

    // ------------------------------------------------------------------
    // 6. Agrupar por clave única → detectar duplicados internos del Excel
    // ------------------------------------------------------------------
    const timeRowGroups = new Map<string, typeof timeRows>();
    for (const tr of timeRows) {
      const k = `${tr.engagement_id}|${tr.employee_gui}|${tr.transaction_date ?? ""}|${tr.activity_code ?? ""}|${tr.charged_hours ?? ""}`;
      const g = timeRowGroups.get(k) ?? [];
      g.push(tr);
      timeRowGroups.set(k, g);
    }

    // Deduped: keep last occurrence of each key
    const dedupedTimeRows = [...timeRowGroups.values()].map((g) => g[g.length - 1]);
    const intraExcelDupes = timeRows.length - dedupedTimeRows.length;

    // Build intra-conflict groups (only where values actually differ between occurrences)
    const intraConflicts: IntraConflictGroup[] = [];
    for (const [, g] of timeRowGroups) {
      if (g.length <= 1) continue;
      const hasVariance = g.some(
        (r) => r.charged_hours !== g[0].charged_hours || r.ansr_revenue !== g[0].ansr_revenue
      );
      if (!hasVariance) continue; // identical rows, nothing to decide
      const first = g[0];
      intraConflicts.push({
        employee_name: employees.get(first.employee_gui)?.name ?? null,
        employee_gui:  first.employee_gui,
        engagement_id: first.engagement_id,
        transaction_date: first.transaction_date ?? "",
        activity_code: first.activity_code,
        autoKeptIdx: g.length - 1,
        occurrences: g.map((r, i) => ({
          idx: i + 1,
          charged_hours:  r.charged_hours,
          ansr_revenue:   r.ansr_revenue,
          accounting_date: r.accounting_date,
          row: r as unknown as Record<string, unknown>,
        })),
      });
    }

    // ------------------------------------------------------------------
    // 6b. Deduplicar gastos + detectar duplicados internos
    // ------------------------------------------------------------------
    // Clave de dedup:
    //   - Con voucher_id → engagement + voucher + importe + descripción
    //     (un PO/voucher SAP puede tener múltiples líneas con distinto
    //      producto e importe; sólo son duplicados si coinciden en todo)
    //   - Sin voucher_id → clave natural completa
    const expenseRowGroups = new Map<string, typeof expenseRows>();
    for (const er of expenseRows) {
      const k = er.voucher_id
        ? `v:${er.engagement_id}|${er.voucher_id}|${er.expense_amount}|${er.expense_description ?? ""}`
        : `n:${er.engagement_id}|${er.vendor_id ?? ""}|${er.transaction_type_code}|${er.transaction_date ?? ""}|${er.expense_amount}|${er.accounting_date ?? ""}|${er.expense_description ?? ""}`;
      const g = expenseRowGroups.get(k) ?? [];
      g.push(er);
      expenseRowGroups.set(k, g);
    }
    const dedupedExpenseRows = [...expenseRowGroups.values()].map((g) => g[g.length - 1]);
    const expenseIntraDupes  = expenseRows.length - dedupedExpenseRows.length;

    const intraExpenseConflicts: IntraExpenseGroup[] = [];
    for (const [, g] of expenseRowGroups) {
      if (g.length <= 1) continue;
      const hasVariance = g.some(
        (r) => r.expense_amount !== g[0].expense_amount || r.expense_description !== g[0].expense_description
      );
      if (!hasVariance) continue;
      const first = g[0];
      intraExpenseConflicts.push({
        engagement_id:         first.engagement_id,
        transaction_date:      first.transaction_date,
        transaction_type_code: first.transaction_type_code,
        vendor_id:             first.vendor_id,
        voucher_id:            first.voucher_id,
        autoKeptIdx:           g.length - 1,
        occurrences: g.map((r, i) => ({
          idx:                 i + 1,
          expense_amount:      r.expense_amount,
          expense_description: r.expense_description,
          accounting_date:     r.accounting_date,
          row:                 r as unknown as Record<string, unknown>,
        })),
      });
    }

    // ------------------------------------------------------------------
    // 7. Llamar a la función RPC
    const conflicts: ConflictRow[] = [];
    if (dedupedTimeRows.length > 0) {
      try {
        const db = createDb();
        const engIds = [...new Set(dedupedTimeRows.map((r) => r.engagement_id))];
        const existingRows = await db`
          SELECT
            f.id, f.engagement_id, f.employee_gui,
            f.transaction_date::text  AS transaction_date,
            f.activity_code,
            f.charged_hours::float8   AS charged_hours,
            f.ansr_revenue::float8    AS ansr_revenue,
            f.accounting_date::text   AS accounting_date,
            e.employee_name
          FROM te.fact_time_charge f
          LEFT JOIN te.dim_employee e ON e.employee_gui = f.employee_gui
          WHERE f.engagement_id = ANY(${engIds})
        `;
        const existingMap = new Map<string, typeof existingRows[number]>();
        for (const row of existingRows) {
          const k = `${row.engagement_id}|${row.employee_gui}|${row.transaction_date}|${row.activity_code ?? ""}|${row.charged_hours ?? ""}`;
          existingMap.set(k, row);
        }
        for (const tr of dedupedTimeRows) {
          const k = `${tr.engagement_id}|${tr.employee_gui}|${tr.transaction_date ?? ""}|${tr.activity_code ?? ""}|${tr.charged_hours ?? ""}`;
          const ex = existingMap.get(k);
          if (ex) {
            conflicts.push({
              employee_name: ex.employee_name as string | null,
              employee_gui: tr.employee_gui,
              engagement_id: tr.engagement_id,
              transaction_date: tr.transaction_date ?? "",
              activity_code: tr.activity_code,
              existing: {
                id: ex.id as number,
                charged_hours: ex.charged_hours as number | null,
                ansr_revenue: ex.ansr_revenue as number | null,
                accounting_date: ex.accounting_date as string | null,
              },
              incoming: tr as unknown as Record<string, unknown>,
            });
          }
        }
        await db.end();
      } catch (dbErr) {
        console.error("[upload] conflict detection error:", dbErr);
        // Non-fatal: continue without conflict info
      }
    }

    // ------------------------------------------------------------------
    // 8. Llamar a la función RPC (upsert dims + insert hechos en 1 llamada)
    // ------------------------------------------------------------------
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "load_time_expense",
      {
        p_clients: [...clients.entries()].map(([k, v]) => ({ client_id: k, client_name: v })),
        p_opportunities: [...opps.entries()].map(([k, v]) => ({
          opportunity_id: k,
          opportunity_name: v.name,
          client_id: v.client_id,
        })),
        p_projects: [...projects.entries()].map(([k, v]) => ({
          project_id: k,
          project_name: v.name,
          opportunity_id: v.opp_id,
        })),
        p_engagements: [...engagements.entries()].map(([k, v]) => ({
          engagement_id: k,
          engagement_name: v.name,
          project_id: v.project_id,
          service_line: v.service_line,
          country_region: v.country,
        })),
        p_ranks:  [...ranks].map((r) => ({ rank_code: r })),
        p_grades: [...grades].map((g) => ({ grade: g })),
        p_employees: [...employees.entries()].map(([k, v]) => ({
          employee_gui: k,
          employee_name: v.name,
          gds: v.gds,
          cost_center: v.cost_center,
          employee_region: v.region,
          business_unit: v.bu,
          rank_code: v.rank,
          grade: v.grade,
        })),
        p_vendors:    [...vendors.entries()].map(([k, v]) => ({ vendor_id: k, vendor_name: v })),
        p_accounts:   [...accounts.entries()].map(([k, v]) => ({ account_id: k, account_name: v })),
        p_activities: [...activities.entries()].map(([k, v]) => ({
          activity_code: k,
          activity_description: v,
        })),
        p_categories: [...categories.entries()].map(([k, v]) => ({
          category_code: k,
          category_description: v.desc,
          sub_category_description: v.sub,
        })),
        p_ttypes:       [...transactionTypes].map((t) => ({ transaction_type_code: t })),
        p_time_rows:    dedupedTimeRows,
        p_expense_rows: dedupedExpenseRows,
      }
    );

    if (rpcError) {
      console.error("[upload] rpc error:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as { time_inserted: number; expense_inserted: number };

    return NextResponse.json({
      success: true,
      stats: {
        total_rows: rows.length,
        time_charges_attempted: dedupedTimeRows.length,
        time_charges_inserted: result.time_inserted,
        time_charges_skipped: dedupedTimeRows.length - result.time_inserted - conflicts.length,
        time_charges_intra_dupes: intraExcelDupes,
        expenses_attempted: dedupedExpenseRows.length,
        expenses_inserted: result.expense_inserted,
        expenses_skipped: dedupedExpenseRows.length - result.expense_inserted,
        expenses_intra_dupes: expenseIntraDupes,
      },
      conflicts,
      intraConflicts,
      intraExpenseConflicts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[upload] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
