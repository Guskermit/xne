-- =============================================================================
-- ANSR mensual desglosado por engagement para un cliente
-- Usado en la gráfica de barras apiladas de la página "Visión por Cliente"
-- =============================================================================
create or replace function public.get_client_engagement_monthly_ansr(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  mes              text,
  engagement_id    text,
  engagement_name  text,
  ansr             float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    to_char(coalesce(t.accounting_date, t.transaction_date), 'YYYY-MM') as mes,
    e.engagement_id,
    coalesce(e.engagement_name, e.engagement_id)                         as engagement_name,
    sum(t.ansr_revenue)::float8                                          as ansr
  from fact_time_charge t
  join dim_engagement  e on e.engagement_id  = t.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where c.client_id = p_client_id
    and coalesce(t.ansr_revenue, 0) <> 0
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(t.accounting_date, t.transaction_date)) = p_fiscal_year
    )
  group by 1, 2, 3
  order by 1, 4 desc;
$$;

grant execute on function public.get_client_engagement_monthly_ansr(text, integer) to authenticated;
