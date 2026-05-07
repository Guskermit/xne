-- =============================================================================
-- Estado del proyecto en engagement_budget
-- status: 'activo' (default) | 'cerrado'
-- =============================================================================

-- 1. Añadir columna status
alter table te.engagement_budget
  add column if not exists status text not null default 'activo'
  check (status in ('activo', 'cerrado'));

-- 2. RPC para guardar el estado
create or replace function public.set_engagement_status(
  p_engagement_id text,
  p_status        text
)
returns void
language sql
security definer
set search_path = te, public
as $$
  insert into engagement_budget (engagement_id, budget, status, updated_at)
  values (p_engagement_id, 0, p_status, now())
  on conflict (engagement_id) do update
    set status     = excluded.status,
        updated_at = excluded.updated_at;
$$;

grant execute on function public.set_engagement_status(text, text) to authenticated;

-- 3. Actualizar get_engagement_kpis para devolver status y admitir filtro activo
drop function if exists public.get_engagement_kpis(integer);

create or replace function public.get_engagement_kpis(
  p_fiscal_year integer default null,
  p_active_only boolean default false
)
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
  budget           float8,
  status           text
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
    (coalesce(tc.ansr, 0) + coalesce(ex.gasto_total, 0))::float8  as ter,
    b.budget::float8                                               as budget,
    coalesce(b.status, 'activo')                                   as status
  from dim_engagement  e
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = e.engagement_id
  left join ex on ex.engagement_id = e.engagement_id
  left join engagement_budget b on b.engagement_id = e.engagement_id
  where (coalesce(tc.horas, 0) > 0 or coalesce(ex.gasto_total, 0) > 0)
    and (not p_active_only or coalesce(b.status, 'activo') = 'activo')
  order by coalesce(tc.ansr, 0) desc;
$$;

grant execute on function public.get_engagement_kpis(integer, boolean) to authenticated;

-- 4. Actualizar get_client_kpis para admitir filtro activo
drop function if exists public.get_client_kpis(integer);

create or replace function public.get_client_kpis(
  p_fiscal_year integer default null,
  p_active_only boolean default false
)
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
  where (coalesce(tc.horas, 0) > 0 or coalesce(ex.gasto_total, 0) > 0)
    and (not p_active_only or coalesce(b.status, 'activo') = 'activo')
  group by c.client_id, c.client_name
  order by coalesce(sum(tc.ansr), 0) desc;
$$;

grant execute on function public.get_client_kpis(integer, boolean) to authenticated;
