-- =============================================================================
-- KPIs mensuales por empleado para un cliente (todos sus engagements)
-- =============================================================================

create or replace function public.get_client_employee_monthly_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  mes           text,
  employee_gui  text,
  employee_name text,
  rank_code     text,
  horas         float8,
  nsr           float8,
  ansr          float8,
  coste_margen  float8,
  margen_bruto  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    to_char(coalesce(t.accounting_date, t.transaction_date), 'YYYY-MM') as mes,
    t.employee_gui,
    e2.employee_name,
    t.rank_code,
    sum(t.charged_hours)::float8                              as horas,
    sum(t.nsr_revenue)::float8                               as nsr,
    sum(t.ansr_revenue)::float8                              as ansr,
    sum(t.margin_cost)::float8                               as coste_margen,
    (sum(t.ansr_revenue) - sum(t.margin_cost))::float8       as margen_bruto
  from fact_time_charge t
  join dim_engagement  e  on e.engagement_id   = t.engagement_id
  join dim_project     p  on p.project_id      = e.project_id
  join dim_opportunity o  on o.opportunity_id  = p.opportunity_id
  left join dim_employee e2 on e2.employee_gui = t.employee_gui
  where o.client_id = p_client_id
    and coalesce(t.charged_hours, 0) > 0
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(t.accounting_date, t.transaction_date)) = p_fiscal_year
    )
  group by 1, 2, 3, 4
  order by 1, 5 desc;
$$;

grant execute on function public.get_client_employee_monthly_kpis(text, integer) to authenticated;
