-- =============================================================================
-- Índice único parcial para gastos SIN voucher_id.
-- Nota: journal_id NO se usa como clave porque un journal SAP puede tener
-- múltiples líneas con distintos importes/descripciones.
-- =============================================================================

-- Clave natural: engagement + vendor + tipo + fecha + importe +
--               fecha_contable + descripción  (solo cuando no hay voucher)
create unique index if not exists uq_expense_natural
  on te.fact_expense (
    engagement_id,
    coalesce(vendor_id, ''),
    transaction_type_code,
    transaction_date,
    expense_amount,
    coalesce(accounting_date, '1970-01-01'::date),
    coalesce(expense_description, '')
  )
  where voucher_id is null;
