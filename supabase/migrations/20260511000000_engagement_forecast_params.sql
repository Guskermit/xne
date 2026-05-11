-- =============================================================================
-- Parámetros para el forecast de un engagement
-- Devuelve: nº de empleados activos y última fecha con imputaciones.
-- =============================================================================

create or replace function public.get_engagement_forecast_params(
  p_engagement_id text,
  p_fiscal_year   integer default null
)
returns table (
  headcount integer,
  last_date date
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    count(distinct employee_gui)::integer as headcount,
    max(coalesce(accounting_date, transaction_date))::date as last_date
  from fact_time_charge
  where engagement_id = p_engagement_id
    and coalesce(charged_hours, 0) > 0
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    );
$$;

grant execute on function public.get_engagement_forecast_params(text, integer) to authenticated;
