-- =============================================================================
-- RPC para vaciado completo de datos (hechos + dimensiones + semillas)
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================
create or replace function public.truncate_all_data()
returns void
language plpgsql
security definer
set search_path = te, public
as $$
begin
  -- engagement_budget se excluye intencionalmente: los presupuestos sobreviven al borrado
  truncate table
    fact_time_charge,
    fact_expense,
    dim_employee,
    dim_vendor,
    dim_account,
    dim_activity,
    dim_category,
    dim_engagement,
    dim_project,
    dim_opportunity,
    dim_client,
    dim_transaction_type,
    dim_rank,
    dim_grade
  restart identity
  cascade;

  -- Restaurar semillas
  insert into dim_transaction_type (transaction_type_code) values
    ('Labor'),
    ('AP (FB60 Solution) Expense'),
    ('Travel Expense')
  on conflict do nothing;

  insert into dim_rank (rank_code) values
    ('Staff/Assistant'),
    ('Senior'),
    ('Manager'),
    ('Senior Manager'),
    ('Partner/Principal')
  on conflict do nothing;

  insert into dim_grade (grade) values ('1'), ('2'), ('3')
  on conflict do nothing;
end;
$$;

-- Solo el rol service_role puede llamarla (no authenticated ni anon)
-- La llamada se hace desde el servidor con el service_role key
revoke execute on function public.truncate_all_data() from public, anon, authenticated;
grant  execute on function public.truncate_all_data() to service_role;
