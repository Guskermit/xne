-- =============================================================================
-- Add color column to chart RPCs
-- (must DROP first because return type changes)
-- =============================================================================

drop function if exists public.get_global_monthly_ter_by_client(integer);
drop function if exists public.get_global_quarterly_ter_by_client(integer);
drop function if exists public.get_global_monthly_expenses_by_vendor(integer);
drop function if exists public.get_client_vendor_monthly_expenses(text, integer);


-- 1. get_global_monthly_ter_by_client → add client color
create or replace function public.get_global_monthly_ter_by_client(
  p_fiscal_year integer default null
)
returns table (
  mes          text,
  client_id    text,
  client_name  text,
  color        text,
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
    c.color,
    (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0))::float8 as ter
  from all_eng_months aem
  join dim_engagement  e on e.engagement_id  = aem.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = aem.engagement_id and tc.mes = aem.mes
  left join ex on ex.engagement_id = aem.engagement_id and ex.mes = aem.mes
  group by aem.mes, c.client_id, c.client_name, c.color
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by 1, 5 desc;
$$;

grant execute on function public.get_global_monthly_ter_by_client(integer) to authenticated;


-- 2. get_global_quarterly_ter_by_client → add client color
create or replace function public.get_global_quarterly_ter_by_client(
  p_fiscal_year integer default null
)
returns table (
  quarter      text,
  quarter_sort text,
  client_id    text,
  client_name  text,
  color        text,
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
    c.color,
    coalesce(sum(tc.ansr),   0)::float8                     as ansr,
    coalesce(sum(ex.gastos), 0)::float8                     as gastos
  from all_pairs ap
  join dim_engagement  e on e.engagement_id  = ap.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.qstart = ap.qstart and tc.engagement_id = ap.engagement_id
  left join ex on ex.qstart = ap.qstart and ex.engagement_id = ap.engagement_id
  group by ap.qstart, c.client_id, c.client_name, c.color
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by quarter_sort, c.client_name;
$$;

grant execute on function public.get_global_quarterly_ter_by_client(integer) to authenticated;


-- 3. get_global_monthly_expenses_by_vendor → add vendor color
create or replace function public.get_global_monthly_expenses_by_vendor(
  p_fiscal_year integer default null
)
returns table (
  mes          text,
  vendor_id    text,
  vendor_name  text,
  color        text,
  gasto_total  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as mes,
    coalesce(x.vendor_id, '—')                                           as vendor_id,
    coalesce(v.vendor_name, '(sin vendor)')                              as vendor_name,
    v.color,
    sum(x.expense_amount)::float8                                        as gasto_total
  from fact_expense x
  left join dim_vendor v on v.vendor_id = x.vendor_id
  where coalesce(x.accounting_date, x.transaction_date) is not null
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year
    )
  group by 1, 2, 3, 4
  order by 1, 5 desc;
$$;

grant execute on function public.get_global_monthly_expenses_by_vendor(integer) to authenticated;


-- 4. get_client_vendor_monthly_expenses → add vendor color
create or replace function public.get_client_vendor_monthly_expenses(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  mes          text,
  vendor_id    text,
  vendor_name  text,
  color        text,
  gasto_total  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as mes,
    coalesce(x.vendor_id, '—')                                           as vendor_id,
    coalesce(v.vendor_name, '(sin vendor)')                              as vendor_name,
    v.color,
    sum(x.expense_amount)::float8                                        as gasto_total
  from fact_expense x
  join dim_engagement  e   on e.engagement_id   = x.engagement_id
  join dim_project     p   on p.project_id      = e.project_id
  join dim_opportunity o   on o.opportunity_id  = p.opportunity_id
  join dim_client      c   on c.client_id       = o.client_id
  left join dim_vendor v   on v.vendor_id       = x.vendor_id
  where c.client_id = p_client_id
    and coalesce(x.accounting_date, x.transaction_date) is not null
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year
    )
  group by 1, 2, 3, 4
  order by 1, 5 desc;
$$;

grant execute on function public.get_client_vendor_monthly_expenses(text, integer) to authenticated;
