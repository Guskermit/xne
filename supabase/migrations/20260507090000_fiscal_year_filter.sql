-- =============================================================================
-- Fiscal year support
-- FY = año que termina en junio: FY2026 = 1 Jul 2025 – 30 Jun 2026
-- =============================================================================

-- Helper interno: devuelve el fiscal year de una fecha
create or replace function te.fiscal_year(d date)
returns integer
language sql
immutable
as $$
  select case when extract(month from d) >= 7
              then extract(year from d)::integer + 1
              else extract(year from d)::integer
         end;
$$;

-- ---------------------------------------------------------------------------
-- Años fiscales disponibles en la base de datos
-- ---------------------------------------------------------------------------
create or replace function public.get_fiscal_years()
returns table (fiscal_year integer)
language sql
security definer
stable
set search_path = te, public
as $$
  select distinct te.fiscal_year(coalesce(accounting_date, transaction_date)) as fiscal_year
  from fact_time_charge
  where coalesce(accounting_date, transaction_date) is not null
  union
  select distinct te.fiscal_year(coalesce(accounting_date, transaction_date))
  from fact_expense
  where coalesce(accounting_date, transaction_date) is not null
  order by 1 desc;
$$;

grant execute on function public.get_fiscal_years() to authenticated;

-- ---------------------------------------------------------------------------
-- get_engagement_kpis con filtro de FY
-- ---------------------------------------------------------------------------
drop function if exists public.get_engagement_kpis();

create or replace function public.get_engagement_kpis(p_fiscal_year integer default null)
returns table (
  client_name      text,
  project_name     text,
  engagement_id    text,
  engagement_name  text,
  horas            float8,
  nsr              float8,
  ansr             float8,
  coste_margen     float8,
  margen_bruto     float8,
  gasto_total      float8,
  ter              float8,
  budget           float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      engagement_id,
      sum(charged_hours) as horas,
      sum(nsr_revenue)   as nsr,
      sum(ansr_revenue)  as ansr,
      sum(margin_cost)   as coste_margen
    from fact_time_charge
    where p_fiscal_year is null
       or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    group by engagement_id
  ),
  ex as (
    select
      engagement_id,
      sum(expense_amount) as gasto_total
    from fact_expense
    where p_fiscal_year is null
       or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    group by engagement_id
  )
  select
    c.client_name,
    p.project_name,
    e.engagement_id,
    e.engagement_name,
    coalesce(tc.horas,        0)::float8 as horas,
    coalesce(tc.nsr,          0)::float8 as nsr,
    coalesce(tc.ansr,         0)::float8 as ansr,
    coalesce(tc.coste_margen, 0)::float8 as coste_margen,
    (coalesce(tc.ansr, 0) - coalesce(tc.coste_margen, 0))::float8 as margen_bruto,
    coalesce(ex.gasto_total,  0)::float8 as gasto_total,
    (coalesce(tc.ansr, 0) + coalesce(ex.gasto_total, 0))::float8 as ter,
    b.budget::float8 as budget
  from dim_engagement  e
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = e.engagement_id
  left join ex on ex.engagement_id = e.engagement_id
  left join engagement_budget b on b.engagement_id = e.engagement_id
  where coalesce(tc.horas, 0) > 0 or coalesce(ex.gasto_total, 0) > 0
  order by coalesce(tc.ansr, 0) desc;
$$;

grant execute on function public.get_engagement_kpis(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_client_kpis con filtro de FY
-- ---------------------------------------------------------------------------
drop function if exists public.get_client_kpis();

create or replace function public.get_client_kpis(p_fiscal_year integer default null)
returns table (
  client_id        text,
  client_name      text,
  n_engagements    bigint,
  horas            float8,
  nsr              float8,
  ansr             float8,
  coste_margen     float8,
  margen_bruto     float8,
  gasto_total      float8,
  ter              float8,
  budget           float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      engagement_id,
      sum(charged_hours) as horas,
      sum(nsr_revenue)   as nsr,
      sum(ansr_revenue)  as ansr,
      sum(margin_cost)   as coste_margen
    from fact_time_charge
    where p_fiscal_year is null
       or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    group by engagement_id
  ),
  ex as (
    select
      engagement_id,
      sum(expense_amount) as gasto_total
    from fact_expense
    where p_fiscal_year is null
       or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    group by engagement_id
  )
  select
    c.client_id,
    c.client_name,
    count(distinct e.engagement_id)::bigint                       as n_engagements,
    coalesce(sum(tc.horas),        0)::float8                     as horas,
    coalesce(sum(tc.nsr),          0)::float8                     as nsr,
    coalesce(sum(tc.ansr),         0)::float8                     as ansr,
    coalesce(sum(tc.coste_margen), 0)::float8                     as coste_margen,
    coalesce(sum(tc.ansr) - sum(tc.coste_margen), 0)::float8      as margen_bruto,
    coalesce(sum(ex.gasto_total),  0)::float8                     as gasto_total,
    coalesce(sum(tc.ansr) + sum(ex.gasto_total), 0)::float8       as ter,
    sum(b.budget)::float8                                         as budget
  from dim_engagement  e
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = e.engagement_id
  left join ex on ex.engagement_id = e.engagement_id
  left join engagement_budget b on b.engagement_id = e.engagement_id
  where coalesce(tc.horas, 0) > 0 or coalesce(ex.gasto_total, 0) > 0
  group by c.client_id, c.client_name
  order by coalesce(sum(tc.ansr), 0) desc;
$$;

grant execute on function public.get_client_kpis(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_project_monthly_kpis con filtro de FY
-- ---------------------------------------------------------------------------
drop function if exists public.get_project_monthly_kpis(text);

create or replace function public.get_project_monthly_kpis(
  p_engagement_id text,
  p_fiscal_year   integer default null
)
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
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  expense_monthly as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(expense_amount)  as gasto_total
    from fact_expense
    where engagement_id = p_engagement_id
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  all_months as (
    select mes from time_monthly
    union
    select mes from expense_monthly
  )
  select
    m.mes,
    coalesce(t.horas,        0)::float8                              as horas,
    coalesce(t.nsr,          0)::float8                              as nsr,
    coalesce(t.ansr,         0)::float8                              as ansr,
    coalesce(t.coste_margen, 0)::float8                              as coste_margen,
    (coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0))::float8     as margen_bruto,
    coalesce(x.gasto_total,  0)::float8                              as gasto_total,
    (coalesce(t.ansr, 0) + coalesce(x.gasto_total, 0))::float8      as ter
  from all_months m
  left join time_monthly   t using (mes)
  left join expense_monthly x using (mes)
  order by m.mes;
$$;

grant execute on function public.get_project_monthly_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_client_monthly_kpis con filtro de FY
-- ---------------------------------------------------------------------------
drop function if exists public.get_client_monthly_kpis(text);

create or replace function public.get_client_monthly_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
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
  with engagement_ids as (
    select e.engagement_id
    from   dim_engagement  e
    join   dim_project     p on p.project_id     = e.project_id
    join   dim_opportunity o on o.opportunity_id = p.opportunity_id
    where  o.client_id = p_client_id
  ),
  time_monthly as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(charged_hours)   as horas,
      sum(nsr_revenue)     as nsr,
      sum(ansr_revenue)    as ansr,
      sum(margin_cost)     as coste_margen
    from fact_time_charge
    where engagement_id in (select engagement_id from engagement_ids)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  expense_monthly as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(expense_amount)  as gasto_total
    from fact_expense
    where engagement_id in (select engagement_id from engagement_ids)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  all_months as (
    select mes from time_monthly
    union
    select mes from expense_monthly
  )
  select
    m.mes,
    coalesce(t.horas,        0)::float8                              as horas,
    coalesce(t.nsr,          0)::float8                              as nsr,
    coalesce(t.ansr,         0)::float8                              as ansr,
    coalesce(t.coste_margen, 0)::float8                              as coste_margen,
    (coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0))::float8     as margen_bruto,
    coalesce(x.gasto_total,  0)::float8                              as gasto_total,
    (coalesce(t.ansr, 0) + coalesce(x.gasto_total, 0))::float8      as ter
  from all_months m
  left join time_monthly   t using (mes)
  left join expense_monthly x using (mes)
  order by m.mes;
$$;

grant execute on function public.get_client_monthly_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_engagement_expenses_by_vendor con filtro de FY
-- ---------------------------------------------------------------------------
drop function if exists public.get_engagement_expenses_by_vendor(text);

create or replace function public.get_engagement_expenses_by_vendor(
  p_engagement_id text,
  p_fiscal_year   integer default null
)
returns table (
  vendor_id              text,
  vendor_name            text,
  transaction_type_code  text,
  category_description   text,
  total_gasto            float8,
  n_lineas               bigint
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    coalesce(x.vendor_id, '—')                   as vendor_id,
    coalesce(v.vendor_name, '(sin vendor)')       as vendor_name,
    x.transaction_type_code,
    coalesce(cat.category_description, '—')       as category_description,
    sum(x.expense_amount)::float8                 as total_gasto,
    count(*)::bigint                              as n_lineas
  from fact_expense x
  left join dim_vendor   v   on v.vendor_id      = x.vendor_id
  left join dim_category cat on cat.category_code = x.category_code
  where x.engagement_id = p_engagement_id
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
  group by x.vendor_id, v.vendor_name, x.transaction_type_code, cat.category_description
  order by total_gasto desc;
$$;

grant execute on function public.get_engagement_expenses_by_vendor(text, integer) to authenticated;
