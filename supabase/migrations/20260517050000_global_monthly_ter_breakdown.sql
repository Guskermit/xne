-- =============================================================================
-- TER mensual global desglosado en ANSR y Gastos
-- Usado en la gráfica de evolución mensual del resumen global
-- =============================================================================
create or replace function public.get_global_monthly_ter_breakdown(
  p_fiscal_year integer default null
)
returns table (
  mes    text,
  ansr   float8,
  gastos float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (
        p_fiscal_year is null
        or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
      )
    group by 1
  ),
  ex as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (
        p_fiscal_year is null
        or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
      )
    group by 1
  ),
  months as (
    select mes from tc
    union
    select mes from ex
  )
  select
    m.mes,
    coalesce(tc.ansr,   0)::float8 as ansr,
    coalesce(ex.gastos, 0)::float8 as gastos
  from months m
  left join tc on tc.mes = m.mes
  left join ex on ex.mes = m.mes
  order by 1;
$$;

grant execute on function public.get_global_monthly_ter_breakdown(integer) to authenticated;
