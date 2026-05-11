-- =============================================================================
-- Parámetros de forecast para un cliente (headcount + última fecha de cargos)
-- =============================================================================

create or replace function public.get_client_forecast_params(
  p_client_id   text,
  p_fiscal_year integer default null
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
    count(distinct t.employee_gui)::integer                                        as headcount,
    max(coalesce(t.accounting_date, t.transaction_date))::date                     as last_date
  from fact_time_charge t
  join dim_engagement  e on e.engagement_id  = t.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  where o.client_id = p_client_id
    and coalesce(t.charged_hours, 0) > 0
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(t.accounting_date, t.transaction_date)) = p_fiscal_year
    );
$$;

grant execute on function public.get_client_forecast_params(text, integer) to authenticated;
