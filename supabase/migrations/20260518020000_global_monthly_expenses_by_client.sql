-- =============================================================================
-- Gastos mensuales en proveedores agregados por cliente
-- =============================================================================

create function public.get_global_monthly_expenses_by_client(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  mes          text,
  client_id    text,
  client_name  text,
  color        text,
  gasto_total  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with ex as (
    select
      to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as mes,
      x.engagement_id,
      sum(x.expense_amount) as gastos
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
    group by 1, 2
  )
  select
    ex.mes,
    c.client_id,
    c.client_name,
    c.color,
    sum(ex.gastos)::float8 as gasto_total
  from ex
  join dim_engagement  e on e.engagement_id  = ex.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where (p_business_unit is null or c.business_unit = p_business_unit)
  group by ex.mes, c.client_id, c.client_name, c.color
  having sum(ex.gastos) <> 0
  order by 1, 5 desc;
$$;

grant execute on function public.get_global_monthly_expenses_by_client(integer, text) to authenticated;
