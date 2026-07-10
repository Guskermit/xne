-- =============================================================================
-- Amplía get_fiscal_years para incluir:
--   1. Semanas de forecast (fact_forecast_week)
--   2. El fiscal year en curso (siempre visible aunque no haya datos reales)
-- Con esto, FY2027 (a partir del 1 jul 2026) aparece en el selector
-- aunque todavía no haya imputaciones reales para ese año.
-- =============================================================================

create or replace function public.get_fiscal_years()
returns table (fiscal_year integer)
language sql
security definer
stable
set search_path = te, public
as $$
  select distinct te.fiscal_year(coalesce(accounting_date, transaction_date)) as fiscal_year
  from fact_time_charge
  where coalesce(accounting_date, transaction_date) is not null

  union

  select distinct te.fiscal_year(coalesce(accounting_date, transaction_date))
  from fact_expense
  where coalesce(accounting_date, transaction_date) is not null

  union

  -- Semanas de forecast: permite seleccionar FY aunque sólo haya forecast
  select distinct te.fiscal_year(week_start_date)
  from fact_forecast_week

  union

  -- El FY en curso siempre está disponible
  select te.fiscal_year(current_date)

  order by 1 desc;
$$;

grant execute on function public.get_fiscal_years() to authenticated;
