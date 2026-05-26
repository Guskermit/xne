-- =============================================================================
-- RPC: get_client_weekly_kpis
--   Evolución semanal de imputaciones (horas y ANSR) para un cliente dado.
--   week_key = fecha del sábado (fin de semana), formato YYYY-MM-DD.
-- =============================================================================

create or replace function public.get_client_weekly_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  week_key       text,
  charged_hours  float8,
  ansr_revenue   float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    (date_trunc('week', coalesce(tc.week_ending_date, tc.transaction_date))
      + interval '6 days')::date::text  as week_key,
    sum(tc.charged_hours)::float8    as charged_hours,
    sum(tc.ansr_revenue)::float8     as ansr_revenue
  from fact_time_charge tc
  join dim_engagement  e  on e.engagement_id   = tc.engagement_id
  join dim_project     p  on p.project_id      = e.project_id
  join dim_opportunity o  on o.opportunity_id  = p.opportunity_id
  join dim_client      c  on c.client_id       = o.client_id
  where c.client_id = p_client_id
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(tc.accounting_date, tc.transaction_date)) = p_fiscal_year
    )
  group by 1
  order by 1;
$$;

grant execute on function public.get_client_weekly_kpis(text, integer) to authenticated;
