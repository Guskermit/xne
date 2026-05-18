-- =============================================================================
-- TER mensual desglosado por cliente (global, todos los engagements)
-- Usado en la gráfica de barras apiladas del resumen global del dashboard
-- TER = ANSR + gastos totales
-- =============================================================================
create or replace function public.get_global_monthly_ter_by_client(
  p_fiscal_year integer default null
)
returns table (
  mes          text,
  client_id    text,
  client_name  text,
  ter          float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      engagement_id,
      sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (
        p_fiscal_year is null
        or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
      )
    group by 1, 2
  ),
  ex as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      engagement_id,
      sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (
        p_fiscal_year is null
        or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
      )
    group by 1, 2
  ),
  all_eng_months as (
    select mes, engagement_id from tc
    union
    select mes, engagement_id from ex
  )
  select
    aem.mes,
    c.client_id,
    c.client_name,
    (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0))::float8 as ter
  from all_eng_months aem
  join dim_engagement  e on e.engagement_id  = aem.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = aem.engagement_id and tc.mes = aem.mes
  left join ex on ex.engagement_id = aem.engagement_id and ex.mes = aem.mes
  group by aem.mes, c.client_id, c.client_name
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by 1, 4 desc;
$$;

grant execute on function public.get_global_monthly_ter_by_client(integer) to authenticated;
