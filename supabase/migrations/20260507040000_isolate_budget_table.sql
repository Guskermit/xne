-- =============================================================================
-- Aislar presupuesto en tabla independiente para sobrevivir al truncate.
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

-- 1. Tabla de presupuestos (no se borra al vaciar datos)
create table if not exists te.engagement_budget (
  engagement_id text primary key,
  budget        numeric(14,2) not null,
  updated_at    timestamptz default now()
);

-- RLS: solo usuarios autenticados pueden leer/escribir sus propios presupuestos
alter table te.engagement_budget enable row level security;

create policy "read_engagement_budget"
  on te.engagement_budget for select to authenticated using (true);

create policy "write_engagement_budget"
  on te.engagement_budget for all to authenticated using (true) with check (true);

-- 2. Migrar datos existentes de dim_engagement.budget
insert into te.engagement_budget (engagement_id, budget)
select engagement_id, budget
from   te.dim_engagement
where  budget is not null
on conflict (engagement_id) do update set budget = excluded.budget;

-- 3. Quitar columna budget de dim_engagement
alter table te.dim_engagement drop column if exists budget;

-- 4. Actualizar get_engagement_kpis para hacer JOIN con engagement_budget
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
    b.budget::float8                                             as budget
  from v_engagement_pl v
  join dim_engagement  e on e.engagement_id  = v.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join engagement_budget b on b.engagement_id = v.engagement_id
  where coalesce(v.horas, 0) > 0 or coalesce(v.gasto_total, 0) > 0
  order by coalesce(v.ansr, 0) desc;
$$;

grant execute on function public.get_engagement_kpis() to authenticated;

-- 5. Actualizar set_engagement_budget para usar la nueva tabla
create or replace function public.set_engagement_budget(
  p_engagement_id text,
  p_budget        numeric
)
returns void
language sql
security definer
set search_path = te, public
as $$
  insert into engagement_budget (engagement_id, budget, updated_at)
  values (p_engagement_id, p_budget, now())
  on conflict (engagement_id) do update
    set budget     = excluded.budget,
        updated_at = excluded.updated_at;
$$;

grant execute on function public.set_engagement_budget(text, numeric) to authenticated;
