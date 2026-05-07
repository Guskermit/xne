-- =============================================================================
-- Función: KPIs mensuales de un engagement
-- Devuelve la evolución mes a mes de los KPIs para un engagement concreto.
-- =============================================================================

create or replace function public.get_project_monthly_kpis(p_engagement_id text)
returns table (
  mes          text,
  horas        float8,
  nsr          float8,
  ansr         float8,
  coste_margen float8,
  margen_bruto float8,
  gasto_total  float8,
  ter          float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with time_monthly as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(charged_hours)   as horas,
      sum(nsr_revenue)     as nsr,
      sum(ansr_revenue)    as ansr,
      sum(margin_cost)     as coste_margen
    from fact_time_charge
    where engagement_id = p_engagement_id
    group by 1
  ),
  expense_monthly as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(expense_amount)  as gasto_total
    from fact_expense
    where engagement_id = p_engagement_id
    group by 1
  ),
  all_months as (
    select mes from time_monthly
    union
    select mes from expense_monthly
  )
  select
    m.mes,
    coalesce(t.horas,        0)::float8                                              as horas,
    coalesce(t.nsr,          0)::float8                                              as nsr,
    coalesce(t.ansr,         0)::float8                                              as ansr,
    coalesce(t.coste_margen, 0)::float8                                              as coste_margen,
    (coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0))::float8                     as margen_bruto,
    coalesce(x.gasto_total,  0)::float8                                              as gasto_total,
    (coalesce(t.ansr, 0) + coalesce(x.gasto_total, 0))::float8                      as ter
  from all_months m
  left join time_monthly   t using (mes)
  left join expense_monthly x using (mes)
  order by m.mes;
$$;

grant execute on function public.get_project_monthly_kpis(text) to authenticated;
