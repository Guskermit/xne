import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

const SHEET_NAME = "Detail";
const HEADER_ROW_IDX = 7; // 0-based → fila 8 en Excel

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
  // xlsx devuelve números reales para celdas numéricas → path rápido
  if (typeof v === "number") return isNaN(v) ? null : v;
  let str = String(v).trim();
  if (!str) return null;
  // Detectar separador decimal: si hay coma y punto, el que aparece más a la
  // derecha es el decimal (cubre tanto "1.234,56" como "1,234.56")
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
  return isNaN(n) ? null : n;
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
  });

  if (sheetData.length <= HEADER_ROW_IDX) {
    return NextResponse.json({ error: "El fichero no contiene datos suficientes" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "No se encontraron filas de datos" }, { status: 400 });
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
    // 6. Llamar a la función RPC (upsert dims + insert hechos en 1 llamada)
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
        p_time_rows:    timeRows,
        p_expense_rows: expenseRows,
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
        time_charges_attempted: timeRows.length,
        time_charges_inserted: result.time_inserted,
        time_charges_skipped: timeRows.length - result.time_inserted,
        expenses_attempted: expenseRows.length,
        expenses_inserted: result.expense_inserted,
        expenses_skipped: expenseRows.length - result.expense_inserted,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[upload] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
