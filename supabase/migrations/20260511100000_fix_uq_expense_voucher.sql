-- =============================================================================
-- Amplía uq_expense_voucher para incluir importe y descripción.
-- Motivo: un voucher SAP (nº de orden de compra) puede tener múltiples líneas
-- con distinto producto e importe; el constraint original (engagement_id, voucher_id)
-- rechazaba todas las líneas salvo la primera del mismo PO.
-- =============================================================================

drop index if exists te.uq_expense_voucher;

create unique index uq_expense_voucher
  on te.fact_expense (
    engagement_id,
    voucher_id,
    expense_amount,
    coalesce(expense_description, '')
  )
  where voucher_id is not null;
