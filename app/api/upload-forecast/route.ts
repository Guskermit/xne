import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constantes de posición (0-indexed en el array de fila)
// ---------------------------------------------------------------------------
const EMPLOYEE_COL   = 4;   // columna E
const PROJECT_COL    = 5;   // columna F
const DATA_START_COL = 6;   // columna G (primer grupo semanal)
const MAX_SIZE       = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function s(v: unknown): string | null {
  if (v == null || v === "") return null;
  const str = String(v).trim();
  return str || null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? null : n;
}

/**
 * Convierte un valor de celda Excel en una cadena de fecha "YYYY-MM-DD".
 * Soporta: Date de JS (cellDates:true), número serial Excel, cadena ISO.
 */
function toExcelDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const yr = v.getFullYear();
    if (yr < 2000 || yr > 2100) return null;
    try {
      return v.toISOString().split("T")[0];
    } catch {
      return null;
    }
  }
  if (typeof v === "number") {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      if (!d || d.y < 2000 || d.y > 2100) return null;
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } catch {
      return null;
    }
  }
  const str = String(v).trim();
  // Formato europeo DD/MM/YYYY (sin riesgo de excepción)
  const eu = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (eu) {
    const yr = parseInt(eu[3], 10);
    if (yr >= 2000 && yr <= 2100)
      return `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}`;
  }
  // Formato ISO YYYY-MM-DD (sólo acepta años razonables)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const yr = parseInt(iso[1], 10);
    if (yr >= 2000 && yr <= 2100) return str;
  }
  // Último recurso: intentar con Date, capturando cualquier excepción
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const yr = parsed.getFullYear();
      if (yr >= 2000 && yr <= 2100) return parsed.toISOString().split("T")[0];
    }
  } catch {
    // ignorar cadenas que no son fechas
  }
  return null;
}

/**
 * Extrae (nombre, GUID) del texto de la columna E.
 * Formato esperado: "APELLIDO, NOMBRE GUID" o "APELLIDO, NOMBRE – GUID"
 * El GUID es el último token alfanumérico de ≥4 caracteres.
 */
function parseEmployee(cell: string | null): [string | null, string | null] {
  if (!cell) return [null, null];
  const str = cell.trim();
  const m = str.match(/^(.*?)[\s\-–]+([A-Za-z0-9]{4,})\s*$/);
  if (m) return [m[1].trim(), m[2].trim()];
  return [str, null];
}

/**
 * Extrae (nombre engagement, engagement_id) del texto de la columna F.
 * Prioridad:
 *  1. ID Mercury: token que empieza por "I-" o "E-" (ej. "I-A1B2C3", "E-XYZ789")
 *  2. Fallback: último token alfanumérico de ≥4 chars
 */
function parseEngagement(cell: string | null): [string | null, string | null] {
  if (!cell) return [null, null];
  const str = cell.trim();
  // 1. Buscar ID Mercury: I-xxxxx o E-xxxxx (case-insensitive)
  const mercury = str.match(/\b([IE]-[A-Za-z0-9]+)\b/i);
  if (mercury) {
    const id = mercury[1].toUpperCase();
    // El nombre es el texto sin el ID ni separadores sobrantes
    const name = str.replace(mercury[0], "").replace(/^[\s\-–,]+|[\s\-–,]+$/g, "").trim() || str;
    return [name || null, id];
  }
  // 2. Fallback: último token alfanumérico ≥4 chars
  const m = str.match(/^(.*?)[\s\-–]+([A-Za-z0-9]{4,})\s*$/);
  if (m) return [m[1].trim(), m[2].trim()];
  return [str, null];
}

// ── Name matching: relaciona empleados forecast ("Apellido, Nombre") con T&E ("Nombre Apellido") ──

const NAME_STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "van", "da", "das", "von"]);

/** Devuelve el set de tokens normalizados de un nombre: sin diacríticos, en minúsculas, sin partículas */
function nameTokens(name: string | null): Set<string> {
  if (!name) return new Set();
  const tokens = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // á→a, é→e, ñ→n…
    .toLowerCase()
    .replace(/[,;.\-–()]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !NAME_STOP.has(t));
  return new Set(tokens);
}

/**
 * Similitud de nombres (0–1).
 * Criterio: fracción de tokens del nombre más corto que aparecen en el más largo.
 * Score ≥ 0.8 → coincidencia clara.
 * Ejemplos:
 *   "Garcia, Juan"  vs  "Juan Garcia Martinez"  → 2/2 = 1.0  ✓
 *   "Lopez Ruiz, Ana Maria" vs "Ana Maria Lopez" → 3/3 = 1.0  ✓
 */
function nameSimilarity(a: string | null, b: string | null): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [shorter, longer] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hits = 0;
  for (const t of shorter) {
    if (longer.has(t)) hits++;
  }
  return hits / shorter.size;
}

// ---------------------------------------------------------------------------
// Tipos públicos para el cliente
// ---------------------------------------------------------------------------

export type ForecastUploadStats = {
  employees: number;
  engagements: number;
  weeks: number;
  rows_upserted: number;
  intra_dupes: number;
};

export type ForecastUploadResult =
  | { success: true; stats: ForecastUploadStats }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Autenticación
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2. Leer formulario
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
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El fichero supera el límite de 50 MB" }, { status: 400 });
  }

  // 3. Parsear Excel
  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    // cellDates:true → las fechas llegan como objetos Date de JS
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "Fichero Excel inválido" }, { status: 400 });
  }

  // Usar la primera hoja
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    return NextResponse.json({ error: "El Excel no contiene hojas" }, { status: 400 });
  }

  const sheetData = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true, // conserva Date objects producidos por cellDates:true; evita que fechas con formato raro lleguen como strings extremos
  });

  if (sheetData.length === 0) {
    return NextResponse.json({ error: "El fichero no contiene datos" }, { status: 400 });
  }

  // 4. Detectar fila de cabeceras de semana
  // Buscamos la primera fila donde las posiciones G, G+3, G+6… tienen fechas válidas
  let headerRowIdx = -1;
  const weekCols: Array<{ colIdx: number; weekDate: string }> = [];

  for (let ri = 0; ri < Math.min(sheetData.length, 30); ri++) {
    const row = sheetData[ri] as unknown[];
    const potential: typeof weekCols = [];
    for (let ci = DATA_START_COL; ci < row.length; ci += 3) {
      const d = toExcelDate(row[ci]);
      if (d) potential.push({ colIdx: ci, weekDate: d });
    }
    if (potential.length >= 2) {
      headerRowIdx = ri;
      weekCols.push(...potential);
      break;
    }
  }

  if (weekCols.length === 0) {
    return NextResponse.json(
      {
        error:
          "No se encontraron cabeceras de semana (fechas en columnas G, J, M…). " +
          "Asegúrate de cargar el fichero de forecast 'Horas y % Utilización por Recurso y Proyecto'.",
      },
      { status: 400 }
    );
  }

  console.log(
    `[upload-forecast] Hoja "${sheetName}" — fila de cabeceras: ${headerRowIdx + 1}, ` +
      `${weekCols.length} semanas (${weekCols[0].weekDate} → ${weekCols[weekCols.length - 1].weekDate})`
  );

  // 4b. Cargar empleados T&E existentes para hacer matching por nombre
  const { data: existingEmpsData } = await supabase.rpc("get_employees_list");
  const existingEmps: { employee_gui: string; employee_name: string | null }[] =
    (existingEmpsData as any) ?? [];

  /**
   * Resuelve el GUID definitivo para un empleado del forecast:
   * 1. Si el GUID extraído coincide con un empleado T&E → úsalo.
   * 2. Si no, busca por similitud de nombre en los empleados T&E (score ≥ 0.8) → usa su GUID.
   * 3. Si tampoco hay match → usa el GUID extraído (empleado nuevo) o deriva uno del nombre.
   */
  function resolveEmployee(
    rawGui: string | null,
    fcName: string | null
  ): { gui: string; name: string | null } {
    // 1. Match exacto por GUID
    if (rawGui) {
      const exact = existingEmps.find(e => e.employee_gui === rawGui);
      if (exact) return { gui: exact.employee_gui, name: exact.employee_name };
    }
    // 2. Match por similitud de nombre
    if (fcName && existingEmps.length > 0) {
      let bestScore = 0;
      let bestEmp: (typeof existingEmps)[0] | null = null;
      for (const emp of existingEmps) {
        const score = nameSimilarity(fcName, emp.employee_name);
        if (score > bestScore) { bestScore = score; bestEmp = emp; }
      }
      if (bestScore >= 0.8 && bestEmp) {
        console.log(
          `[upload-forecast] Match nombre: "${fcName}" (raw:"${rawGui}") → "${bestEmp.employee_name}" guid:${bestEmp.employee_gui} score:${bestScore.toFixed(2)}`
        );
        return { gui: bestEmp.employee_gui, name: bestEmp.employee_name };
      }
    }
    // 3. Sin match: usar el GUID extraído o derivar uno del nombre
    const fallback = rawGui ??
      (fcName ?? "UNKNOWN").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]/g, "").slice(0, 20).toUpperCase();
    return { gui: fallback, name: fcName };
  }

  // 5. Parsear filas de datos
  const employees  = new Map<string, string | null>();  // gui → name
  const engagements = new Map<string, string | null>(); // eng_id → name

  type ForecastRow = {
    employee_gui:    string;
    engagement_id:   string;
    week_start_date: string;
    effective_hours: number | null;
    billable_hours:  number | null;
  };

  // Usamos Map para deduplicar intra-Excel (misma clave → última fila gana)
  const dedup = new Map<string, ForecastRow>();
  let rawCount = 0;

  for (let ri = headerRowIdx + 1; ri < sheetData.length; ri++) {
    const row = sheetData[ri] as unknown[];
    const empCell = s(row[EMPLOYEE_COL]);
    const prjCell = s(row[PROJECT_COL]);

    // Saltar filas vacías / subtotales
    if (!empCell && !prjCell) continue;

    const [empName, rawEmpGui] = parseEmployee(empCell);
    const [engName, engId]     = parseEngagement(prjCell);

    // Necesitamos al menos nombre o GUID de empleado, y un ID de engagement
    if ((!empName && !rawEmpGui) || !engId) continue;

    const { gui: empGui, name: resolvedEmpName } = resolveEmployee(rawEmpGui, empName);
    if (!empGui) continue;

    employees.set(empGui, resolvedEmpName);
    engagements.set(engId, engName);

    for (const { colIdx, weekDate } of weekCols) {
      const eff  = num(row[colIdx]);
      const bill = num(row[colIdx + 1]);
      if (eff == null && bill == null) continue;

      rawCount++;
      const key = `${empGui}|${engId}|${weekDate}`;
      dedup.set(key, {
        employee_gui:    empGui,
        engagement_id:   engId,
        week_start_date: weekDate,
        effective_hours: eff,
        billable_hours:  bill,
      });
    }
  }

  const rows = [...dedup.values()];
  const intraDupes = rawCount - rows.length;

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron filas de datos válidas (con GUID de empleado e ID de engagement)" },
      { status: 400 }
    );
  }

  console.log(
    `[upload-forecast] ${employees.size} empleados, ${engagements.size} engagements, ` +
      `${rows.length} filas (${intraDupes} intra-duplicados descartados)`
  );

  // 6. Llamar a la RPC de upsert
  const { data: count, error: rpcError } = await supabase.rpc("load_forecast_weeks", {
    p_employees:   [...employees.entries()].map(([k, v]) => ({
      employee_gui:  k,
      employee_name: v,
    })),
    p_engagements: [...engagements.entries()].map(([k, v]) => ({
      engagement_id:   k,
      engagement_name: v,
    })),
    p_rows: rows,
  });

  if (rpcError) {
    console.error("[upload-forecast] RPC error:", rpcError);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    stats: {
      employees:     employees.size,
      engagements:   engagements.size,
      weeks:         weekCols.length,
      rows_upserted: count as number,
      intra_dupes:   intraDupes,
    },
  } satisfies ForecastUploadResult);
}
