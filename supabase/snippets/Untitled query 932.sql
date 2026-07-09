-- =============================================================================
-- Modelo para el forecast semanal de horas por empleado/engagement.
-- Origen: export "Horas y % Utilización por Recurso y Proyecto"
--
-- Columna E del Excel: Empleado (Apellido, Nombre GUID)
-- Columna F del Excel: Proyecto  (nombre proyecto – engagement_id)
-- Columnas G en adelante: grupos de 3 por semana (eff_h, bill_h, %util)
-- =============================================================================

set search_path = te, public;

-- ---------------------------------------------------------------------------
-- Stub para engagements/proyectos que solo aparecen en el forecast y no
-- existen todavía en la jerarquía dimensional completa.
-- ---------------------------------------------------------------------------
insert into dim_client     (client_id,       client_name)
  values ('_FORECAST_', 'Forecast Only')
  on conflict do nothing;

insert into dim_opportunity(opportunity_id,  opportunity_name, client_id)
  values ('_FORECAST_', 'Forecast Only', '_FORECAST_')
  on conflict do nothing;

insert into dim_project    (project_id,      project_name,     opportunity_id)
  values ('_FORECAST_', 'Forecast Only', '_FORECAST_')
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tabla de hechos: forecast semanal
-- ---------------------------------------------------------------------------
create table if not exists te.fact_forecast_week (
  id               bigserial    primary key,
  employee_gui     text         not null,
  engagement_id    text         not null,
  week_start_date  date         not null,
  effective_hours  float8,
  billable_hours   float8,
  loaded_at        timestamptz  not null default now()
);

-- Restricción de unicidad: (empleado, engagement, semana).
-- Un upload posterior sobreescribe el anterior para la misma semana.
create unique index if not exists uq_forecast_week
  on te.fact_forecast_week(employee_gui, engagement_id, week_start_date);

-- Permisos
grant select, insert, update, delete
  on te.fact_forecast_week to authenticated;
grant usage, select
  on sequence te.fact_forecast_week_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: load_forecast_weeks
-- Recibe dimensiones + filas de hechos y hace upsert completo.
-- Parámetros:
--   p_employees   jsonb  [{employee_gui, employee_name}]
--   p_engagements jsonb  [{engagement_id, engagement_name}]
--   p_rows        jsonb  [{employee_gui, engagement_id, week_start_date,
--                          effective_hours, billable_hours}]
-- Devuelve el número de filas insertadas/actualizadas.
-- ---------------------------------------------------------------------------
create or replace function public.load_forecast_weeks(
  p_employees   jsonb,
  p_engagements jsonb,
  p_rows        jsonb
)
returns integer
language plpgsql
security definer
set search_path = te, public
as $$
declare
  v_count integer;
begin
  -- 1. Upsert empleados (solo actualiza nombre si llegó vacío)
  insert into dim_employee (employee_gui, employee_name)
  select e->>'employee_gui', e->>'employee_name'
  from jsonb_array_elements(p_employees) e
  on conflict (employee_gui) do update
    set employee_name = coalesce(
          nullif(excluded.employee_name, ''),
          dim_employee.employee_name
        );

  -- 2. Upsert engagements (usa stub '_FORECAST_' como project si no existe)
  insert into dim_engagement (engagement_id, engagement_name, project_id)
  select
    e->>'engagement_id',
    e->>'engagement_name',
    '_FORECAST_'
  from jsonb_array_elements(p_engagements) e
  on conflict (engagement_id) do update
    set engagement_name = coalesce(
          nullif(excluded.engagement_name, ''),
          dim_engagement.engagement_name
        );

  -- 3. Upsert filas de forecast (ON CONFLICT DO UPDATE → último upload gana)
  with ins as (
    insert into fact_forecast_week (
      employee_gui, engagement_id, week_start_date,
      effective_hours, billable_hours
    )
    select
      r->>'employee_gui',
      r->>'engagement_id',
      (r->>'week_start_date')::date,
      nullif(r->>'effective_hours', '')::float8,
      nullif(r->>'billable_hours',  '')::float8
    from jsonb_array_elements(p_rows) r
    on conflict (employee_gui, engagement_id, week_start_date) do update
      set effective_hours = excluded.effective_hours,
          billable_hours  = excluded.billable_hours,
          loaded_at       = now()
    returning id
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

grant execute on function public.load_forecast_weeks(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_employee_forecast_detail
-- Devuelve el forecast semanal por empleado/engagement.
-- ---------------------------------------------------------------------------
create or replace function public.get_employee_forecast_detail(
  p_employee_guis text[],
  p_fiscal_year   integer default null
)
returns table (
  employee_gui    text,
  employee_name   text,
  engagement_id   text,
  engagement_name text,
  week_key        text,
  effective_hours float8,
  billable_hours  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    fw.employee_gui,
    em.employee_name,
    fw.engagement_id,
    eng.engagement_name,
    fw.week_start_date::text          as week_key,
    fw.effective_hours::float8,
    fw.billable_hours::float8
  from fact_forecast_week fw
  left join dim_employee   em  on em.employee_gui   = fw.employee_gui
  left join dim_engagement eng on eng.engagement_id = fw.engagement_id
  where fw.employee_gui = any(p_employee_guis)
    and (p_fiscal_year is null
         or te.fiscal_year(fw.week_start_date) = p_fiscal_year)
  order by
    coalesce(em.employee_name, fw.employee_gui),
    fw.employee_gui,
    coalesce(eng.engagement_name, fw.engagement_id),
    fw.engagement_id,
    fw.week_start_date;
$$;

grant execute on function public.get_employee_forecast_detail(text[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_employees_with_forecast
-- Lista empleados que tienen datos de forecast (para el selector).
-- ---------------------------------------------------------------------------
create or replace function public.get_employees_with_forecast()
returns table (employee_gui text, employee_name text)
language sql
security definer
stable
set search_path = te, public
as $$
  select distinct
    fw.employee_gui,
    em.employee_name
  from fact_forecast_week fw
  left join dim_employee em on em.employee_gui = fw.employee_gui
  order by em.employee_name nulls last, fw.employee_gui;
$$;

grant execute on function public.get_employees_with_forecast() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: delete_forecast_data
-- Borra todos los datos de forecast (útil para re-cargar desde cero).
-- ---------------------------------------------------------------------------
create or replace function public.delete_forecast_data()
returns void
language sql
security definer
set search_path = te, public
as $$
  truncate te.fact_forecast_week restart identity;
$$;

revoke execute on function public.delete_forecast_data() from public, anon;
grant  execute on function public.delete_forecast_data() to authenticated;
