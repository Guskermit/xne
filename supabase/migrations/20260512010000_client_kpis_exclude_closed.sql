-- =============================================================================
-- Excluye engagements cerrados del cálculo de presupuesto restante en
-- get_client_kpis: ni su budget ni su TER (horas + gastos) se suman,
-- de modo que "presupuesto restante = budget - TER" solo refleja activos.
--
-- También elimina sobrecargas antiguas que causan ambigüedad en PostgREST.
-- =============================================================================

-- Eliminar sobrecargas previas
drop function if exists public.get_client_kpis();
drop function if exists public.get_client_kpis(integer, boolean);

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
  with active_engagements as (
    -- Solo engagements que NO están cerrados
    select e.engagement_id
    from   dim_engagement    e
    left join engagement_budget b on b.engagement_id = e.engagement_id
    where  coalesce(b.status, 'activo') <> 'cerrado'
  ),
  tc as (
    select
      engagement_id,
      sum(charged_hours) as horas,
      sum(nsr_revenue)   as nsr,
      sum(ansr_revenue)  as ansr,
      sum(margin_cost)   as coste_margen
    from fact_time_charge
    where engagement_id in (select engagement_id from active_engagements)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  ),
  ex as (
    select
      engagement_id,
      sum(expense_amount) as gasto_total
    from fact_expense
    where engagement_id in (select engagement_id from active_engagements)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
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
  join active_engagements ae on ae.engagement_id = e.engagement_id
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
