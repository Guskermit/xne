-- =============================================================================
-- Vaciado completo del esquema te
-- Ejecutar en Supabase SQL Editor o con psql.
-- TRUNCATE en cascada vacía primero los hechos y luego las dimensiones.
-- RESTART IDENTITY resetea los contadores bigserial.
-- =============================================================================

-- engagement_budget se excluye intencionalmente: los presupuestos sobreviven al borrado
truncate table
  te.fact_time_charge,
  te.fact_expense,
  te.dim_employee,
  te.dim_vendor,
  te.dim_account,
  te.dim_activity,
  te.dim_category,
  te.dim_engagement,
  te.dim_project,
  te.dim_opportunity,
  te.dim_client,
  te.dim_transaction_type,
  te.dim_rank,
  te.dim_grade
restart identity
cascade;

-- Restaurar los valores semilla de catálogos pequeños
insert into te.dim_transaction_type (transaction_type_code) values
  ('Labor'),
  ('AP (FB60 Solution) Expense'),
  ('Travel Expense')
on conflict do nothing;

insert into te.dim_rank (rank_code) values
  ('Staff/Assistant'),
  ('Senior'),
  ('Manager'),
  ('Senior Manager'),
  ('Partner/Principal')
on conflict do nothing;

insert into te.dim_grade (grade) values ('1'), ('2'), ('3')
on conflict do nothing;
