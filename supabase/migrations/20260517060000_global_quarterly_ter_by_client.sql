-- =============================================================================
-- TER trimestral desglosado por cliente (ANSR + Gastos)
-- Usado en la gráfica multibarra del resumen global
-- =============================================================================
create or replace function public.get_global_quarterly_ter_by_client(
  p_fiscal_year integer default null
)
returns table (
  quarter      text,
  quarter_sort text,
  client_id    text,
  client_name  text,
  ansr         float8,
  gastos       float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      date_trunc('quarter', coalesce(accounting_date, transaction_date)) as qstart,
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
      date_trunc('quarter', coalesce(accounting_date, transaction_date)) as qstart,
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
  all_pairs as (
    select qstart, engagement_id from tc
    union
    select qstart, engagement_id from ex
  )
  select
    'Q' || extract(quarter from ap.qstart)::int
      || ' ' || extract(year from ap.qstart)::int           as quarter,
    to_char(ap.qstart, 'YYYY') || '-Q'
      || extract(quarter from ap.qstart)::int::text         as quarter_sort,
    c.client_id,
    c.client_name,
    coalesce(sum(tc.ansr),   0)::float8                     as ansr,
    coalesce(sum(ex.gastos), 0)::float8                     as gastos
  from all_pairs ap
  join dim_engagement  e on e.engagement_id  = ap.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.qstart = ap.qstart and tc.engagement_id = ap.engagement_id
  left join ex on ex.qstart = ap.qstart and ex.engagement_id = ap.engagement_id
  group by ap.qstart, c.client_id, c.client_name
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by quarter_sort, c.client_name;
$$;

grant execute on function public.get_global_quarterly_ter_by_client(integer) to authenticated;
