-- =============================================================================
-- KPIs agregados por cliente
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================
create or replace function public.get_client_kpis()
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
  select
    c.client_id,
    c.client_name,
    count(distinct v.engagement_id)                                       as n_engagements,
    coalesce(sum(v.horas),        0)::float8                              as horas,
    coalesce(sum(v.nsr),          0)::float8                              as nsr,
    coalesce(sum(v.ansr),         0)::float8                              as ansr,
    coalesce(sum(v.coste_margen), 0)::float8                              as coste_margen,
    coalesce(sum(v.margen_bruto), 0)::float8                              as margen_bruto,
    coalesce(sum(v.gasto_total),  0)::float8                              as gasto_total,
    coalesce(sum(v.ansr + v.gasto_total), 0)::float8                     as ter,
    sum(b.budget)::float8                                                 as budget
  from v_engagement_pl v
  join dim_engagement  e on e.engagement_id  = v.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join engagement_budget b on b.engagement_id = v.engagement_id
  where coalesce(v.horas, 0) > 0 or coalesce(v.gasto_total, 0) > 0
  group by c.client_id, c.client_name
  order by coalesce(sum(v.ansr), 0) desc;
$$;

grant execute on function public.get_client_kpis() to authenticated;
