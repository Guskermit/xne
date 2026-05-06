# Modelo de datos Time & Expense

## Aplicar la migración

Con la CLI de Supabase:

```bash
supabase db push
```

O directamente con `psql`:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260506000000_init_time_expense_model.sql
```

Las tablas se crean en el esquema `te`.

## Cargar el Excel

```bash
pip install openpyxl psycopg[binary] python-dotenv
export DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
python scripts/load_time_expense.py 213015520260505125120.xlsx
```

El script:

1. Lee la hoja `Detail` (cabecera en fila 8).
2. Pobla las dimensiones (`dim_*`) con `upsert`.
3. Trunca y recarga los hechos `fact_time_charge` y `fact_expense`.

Filas con `Transaction Type = Labor` (o con `Charged Hours`) → `fact_time_charge`.
Resto con `Expense Amount` → `fact_expense`, gestionables por
`transaction_type_code` y `vendor_id`.

## Vistas listas para consumir

- `te.v_engagement_pl` — P&L por engagement (horas, ANSR, coste, margen, gasto).
- `te.v_charges_by_employee` — imputaciones por empleado y rank.
- `te.v_expense_by_vendor` — gasto por proveedor y tipo de transacción.
