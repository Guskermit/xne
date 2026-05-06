# Modelo de datos — Time & Expense

Documento de referencia del modelo creado en
[supabase/migrations/20260506000000_init_time_expense_model.sql](supabase/migrations/20260506000000_init_time_expense_model.sql)
para el control de **imputaciones de tiempo** y **gastos** por
cliente / proyecto / engagement / empleado.

Origen: libro `Detail` del export *Time and Expense Detail*.

---

## 1. Visión general

Esquema en estrella alojado en el schema **`te`** de Postgres (Supabase),
con dos tablas de hechos que comparten dimensiones:

```
                ┌──────────────┐
                │ dim_client   │
                └──────┬───────┘
                       │
              ┌────────▼────────┐
              │ dim_opportunity │
              └────────┬────────┘
                       │
                ┌──────▼───────┐
                │ dim_project  │
                └──────┬───────┘
                       │
                ┌──────▼────────┐
                │ dim_engagement│
                └──┬─────────┬──┘
                   │         │
   ┌───────────────▼─┐    ┌──▼────────────────┐
   │ fact_time_charge│    │   fact_expense    │
   └─┬───────┬───────┘    └─┬───────┬─────────┘
     │       │              │       │
 dim_employee│         dim_vendor   │
        dim_rank/grade   dim_account / dim_transaction_type
```

Decisiones clave:

- **Dos hechos** porque las filas del Excel son mutuamente excluyentes:
  o llevan `Charged Hours` (Labor) o `Expense Amount` (gastos), nunca ambos.
- **Granularidades distintas**:
  - `fact_time_charge`: 1 fila por engagement + empleado + fecha + actividad.
  - `fact_expense`: 1 fila por engagement + vendor + tipo + fecha (+ voucher).
- **Dimensiones conformadas** entre ambos hechos: `dim_engagement`,
  `dim_employee` (cuando aplica), `dim_activity`, `dim_transaction_type`.
- **Claves naturales** de origen (IDs de SAP / Mercury) como PKs en las
  dimensiones para soportar cargas idempotentes (`upsert`).

---

## 2. Dimensiones

### `dim_client`
| Columna | Tipo | Notas |
|---|---|---|
| `client_id` (PK) | text | Excel: `Client ID` |
| `client_name` | text | Excel: `Client Name` |

### `dim_opportunity`
| Columna | Tipo | Notas |
|---|---|---|
| `opportunity_id` (PK) | text | `Opportunity ID` |
| `opportunity_name` | text | `Opportunity Name` |
| `client_id` (FK) | text | → `dim_client` |

### `dim_project`
| Columna | Tipo | Notas |
|---|---|---|
| `project_id` (PK) | text | `Project ID` |
| `project_name` | text | `Project Name` |
| `opportunity_id` (FK) | text | → `dim_opportunity` |

### `dim_engagement`
| Columna | Tipo | Notas |
|---|---|---|
| `engagement_id` (PK) | text | `Engagement ID` |
| `engagement_name` | text | `Engagement Name` |
| `project_id` (FK) | text | → `dim_project` |
| `service_line` | text | `Service Line` |
| `country_region` | text | `Country / Region` |
| `currency_code` | text | Default `EUR` |

### `dim_employee`
| Columna | Tipo | Notas |
|---|---|---|
| `employee_gui` (PK) | text | `Employee GUI / Tech Product ID` |
| `employee_name` | text | `Employee / Tech Product Name` |
| `gds` | text | `GDS` |
| `cost_center` | text | `Cost Center` |
| `employee_region` | text | `Employee Region` |
| `business_unit` | text | `Employee Business Unit` |
| `rank_code` (FK) | text | → `dim_rank` |
| `grade` (FK) | text | → `dim_grade` |

> Para gastos sin empleado (filas con `Employee = "Unknown"` / GUI `000000000`)
> el campo `employee_gui` en `fact_expense` queda **NULL**.

### `dim_rank`, `dim_grade`
Catálogos pequeños (precargados con `Staff/Assistant`, `Senior`, `Manager`,
`Senior Manager`, `Partner/Principal` y grados `1`, `2`, `3`).

### `dim_vendor`
| Columna | Tipo | Notas |
|---|---|---|
| `vendor_id` (PK) | text | Parte numérica de `Vendor Name / ID` |
| `vendor_name` | text | Parte textual |

### `dim_account`
| Columna | Tipo | Notas |
|---|---|---|
| `account_id` (PK) | text | Parte numérica de `Account Name / ID` |
| `account_name` | text | Parte textual |

### `dim_transaction_type`
Catálogo. Valores actuales:
- `Labor`
- `AP (FB60 Solution) Expense`
- `Travel Expense`

### `dim_activity`
| Columna | Tipo | Notas |
|---|---|---|
| `activity_code` (PK) | text | `Activity Code` |
| `activity_description` | text | `Activity Code Description` |

### `dim_category`
| Columna | Tipo | Notas |
|---|---|---|
| `category_code` (PK) | text | `Category Code` |
| `category_description` | text | `Category Code Description` |
| `sub_category_description` | text | `Sub Category Description` |

---

## 3. Hechos

### 3.1 `fact_time_charge` — imputaciones de tiempo

Granularidad: **engagement × empleado × `transaction_date` × `activity_code`**.

Restricción de unicidad: `uq_time_charge` sobre esa cuádrupla → permite
recargas idempotentes.

| Columna | Tipo | Origen / Descripción |
|---|---|---|
| `id` | bigserial PK | |
| `engagement_id` | FK | `Engagement ID` |
| `employee_gui` | FK | `Employee GUI` |
| `rank_code` | FK | `Rank / Method` (snapshot del momento) |
| `grade` | FK | `Grade` (snapshot del momento) |
| `transaction_date` | date | `Transaction Date` |
| `accounting_date` | date | `Accounting Date` |
| `week_ending_date` | date | `Week Ending Date` |
| `charged_hours` | numeric | `Charged Hours / Tech Quantity` |
| `nsr_revenue` | numeric | `NSR / Tech Revenue` |
| `eaf_reserve_allocation` | numeric | `EAF Reserve Allocation` |
| `ansr_revenue` | numeric | `ANSR / Tech Revenue` |
| `labor_cost` | numeric | `Labor Cost` |
| `labor_cost_rate` | numeric | `Labor Cost Rate` |
| `tech_uplift_cost` | numeric | `Tech Uplift Cost` |
| `tech_product_cost` | numeric | `Tech Product Cost` |
| `tech_product_cost_rate` | numeric | `Tech Product Cost Rate` |
| `margin_cost` | numeric | `Margin Cost` |
| `margin_cost_rate` | numeric | `Margin Cost Rate` |
| `rate_card_rate` | numeric | `Rate Card Rate` |
| `rate_card_amount` | numeric | `Rate Card Amount` |
| `activity_code` | FK | `Activity Code` |
| `transaction_type_code` | FK | siempre `Labor` |
| `relieved_flag` | boolean | `Relieved Flag` |
| `currency_code` | text | default `EUR` |
| `loaded_at` | timestamptz | auditoría |

Índices:
- `ix_tc_engagement_date (engagement_id, accounting_date)`
- `ix_tc_employee (employee_gui)`
- `ix_tc_week (week_ending_date)`

Métricas derivadas recomendadas (a calcular en vista o BI):
- `effective_rate = nsr_revenue / charged_hours`
- `gross_margin  = ansr_revenue - margin_cost`
- `% margen     = gross_margin / nullif(ansr_revenue, 0)`

### 3.2 `fact_expense` — gastos del proyecto

Granularidad: **una línea de gasto** (voucher / journal) por engagement.

| Columna | Tipo | Origen / Descripción |
|---|---|---|
| `id` | bigserial PK | |
| `engagement_id` | FK | `Engagement ID` |
| `vendor_id` | FK | `Vendor Name / ID` (parsed) |
| `account_id` | FK | `Account Name / ID` (parsed) |
| `transaction_type_code` | FK | `Transaction Type` |
| `employee_gui` | FK (null) | si el gasto está asociado a un empleado |
| `transaction_date` | date | `Transaction Date` |
| `accounting_date` | date | `Accounting Date` |
| `week_ending_date` | date | `Week Ending Date` |
| `expense_amount` | numeric | `Expense Amount` |
| `expense_description` | text | `Expense Description` |
| `origin` | text | `From / Origin` |
| `destination` | text | `To / Destination` |
| `trip_id` | text | `Trip ID` |
| `journal_id` | text | `Journal ID` |
| `voucher_id` | text | `Voucher ID` |
| `activity_code` | FK | `Activity Code` |
| `category_code` | FK | `Category Code` |
| `currency_code` | text | default `EUR` |
| `loaded_at` | timestamptz | auditoría |

Índices:
- Índice único parcial `uq_expense_voucher (engagement_id, voucher_id) WHERE voucher_id IS NOT NULL` — evita duplicar la misma factura.
- `ix_ex_engagement_type (engagement_id, transaction_type_code)`
- `ix_ex_vendor (vendor_id)`
- `ix_ex_accounting_date (accounting_date)`

Como pediste, los gastos se gestionan funcionalmente pivotando por
`transaction_type_code` (qué tipo de gasto) y `vendor_id` (a quién se paga).

---

## 4. Vistas analíticas

Definidas en la migración:

| Vista | Propósito |
|---|---|
| `te.v_engagement_pl` | P&L por engagement: horas, NSR, ANSR, coste, margen y gasto. |
| `te.v_charges_by_employee` | Imputaciones por empleado y rank (horas, ANSR, coste). |
| `te.v_expense_by_vendor` | Gasto por engagement, tipo de transacción y proveedor. |

Ejemplos de consulta:

```sql
-- Margen y gasto por engagement
select * from te.v_engagement_pl;

-- Top empleados por horas en un engagement
select employee_name, rank_code, horas, ansr, coste
from te.v_charges_by_employee
where engagement_id = 'E-69646049'
order by horas desc;

-- Gasto por proveedor en un engagement
select transaction_type_code, vendor_name, total_gasto, n_lineas
from te.v_expense_by_vendor
where engagement_id = 'E-69646049'
order by total_gasto desc;
```

---

## 5. Reglas de carga (ETL)

Implementado en [scripts/load_time_expense.py](scripts/load_time_expense.py).

1. Lee la hoja `Detail`, **cabecera en fila 8**.
2. **Descarta** filas de subtotales/cabecera (sin `Engagement ID` o sin
   medida cargable).
3. **Bifurca por `Transaction Type`**:
   - `Labor` (o cualquier fila con `Charged Hours`) → `fact_time_charge`.
   - Resto con `Expense Amount` → `fact_expense`.
4. Parsea cadenas tipo `"Nombre - 123456"` (vendor, account) en
   `*_name` + `*_id`.
5. **Upsert** sobre todas las dimensiones (idempotente por PK).
6. **Truncate + insert** en los hechos para garantizar consistencia con la
   última extracción del Excel. Cambiar a *delta* si en el futuro la fuente
   se actualiza incrementalmente.
7. Empleado *Unknown* (GUI `000000000`) → `employee_gui` se carga **NULL**
   en `fact_expense`.

---

## 6. Calidad / consideraciones

- **Moneda**: el export indica “Currency: Engagement”. Se añade
  `currency_code` por si en el futuro hay engagements en otras divisas.
- **`relieved_flag`** marca imputaciones revertidas; tenerlo en cuenta al
  agregar costes/horas reales (excluir o restar según necesidad).
- **Snapshots `rank_code` / `grade` en el hecho de tiempo**: se persisten
  con la fila para preservar el rank en el momento de la imputación
  (los empleados pueden promocionar).
- **RLS**: la migración habilita RLS en dimensiones y hechos con una
  política `select` para `authenticated`. Ajustar a los requisitos reales
  (p. ej. filtrar por `engagement_id` accesible al usuario).

---

## 7. Diagrama ER (resumen)

```
dim_client 1───n dim_opportunity 1───n dim_project 1───n dim_engagement
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          │                   │                   │
                                fact_time_charge        fact_expense              │
                                  │     │     │           │     │     │           │
                          dim_employee  │  dim_activity  dim_vendor  dim_account  │
                              │   │     │                            dim_category │
                          dim_rank dim_grade                  dim_transaction_type┘
```
