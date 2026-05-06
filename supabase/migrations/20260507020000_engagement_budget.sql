-- =============================================================================
-- Presupuesto por engagement
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

-- 1. Columna budget en la dimensión de engagement
alter table te.dim_engagement
  add column if not exists budget numeric(14,2);

-- 2. Actualizar get_engagement_kpis para incluir budget
drop function if exists public.get_engagement_kpis();
create function public.get_engagement_kpis()
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
  select
    c.client_name,
    p.project_name,
    v.engagement_id,
    v.engagement_name,
    coalesce(v.horas,        0)::float8 as horas,
    coalesce(v.nsr,          0)::float8 as nsr,
    coalesce(v.ansr,         0)::float8 as ansr,
    coalesce(v.coste_margen, 0)::float8 as coste_margen,
    coalesce(v.margen_bruto, 0)::float8 as margen_bruto,
    coalesce(v.gasto_total,  0)::float8 as gasto_total,
    (coalesce(v.ansr, 0) + coalesce(v.gasto_total, 0))::float8 as ter,
    e.budget::float8                                             as budget
  from v_engagement_pl v
  join dim_engagement  e on e.engagement_id  = v.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where coalesce(v.horas, 0) > 0 or coalesce(v.gasto_total, 0) > 0
  order by coalesce(v.ansr, 0) desc;
$$;

grant execute on function public.get_engagement_kpis() to authenticated;

-- 3. RPC para guardar el presupuesto de un engagement
create or replace function public.set_engagement_budget(
  p_engagement_id text,
  p_budget        numeric
)
returns void
language sql
security definer
set search_path = te, public
as $$
  update dim_engagement
  set    budget = p_budget
  where  engagement_id = p_engagement_id;
$$;

grant execute on function public.set_engagement_budget(text, numeric) to authenticated;
