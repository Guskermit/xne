-- =============================================================================
-- Tabla y RPCs para persistir overrides del forecast por empleado
-- scope_type: 'engagement' | 'client'
-- =============================================================================

create table if not exists te.forecast_employee_override (
  scope_type    text    not null,          -- 'engagement' | 'client'
  scope_id      text    not null,
  employee_gui  text    not null,
  hours_per_day float8,                    -- horas/día media (lun-jue 9h, vie 6h → default 8.4)
  is_disabled   boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (scope_type, scope_id, employee_gui)
);

-- ---------------------------------------------------------------------------
-- get_forecast_overrides: devuelve todos los overrides de un scope
-- ---------------------------------------------------------------------------
create or replace function public.get_forecast_overrides(
  p_scope_type text,
  p_scope_id   text
)
returns table (
  employee_gui  text,
  hours_per_day float8,
  is_disabled   boolean
)
language sql
security definer
stable
set search_path = te, public
as $$
  select employee_gui, hours_per_day, is_disabled
  from te.forecast_employee_override
  where scope_type = p_scope_type
    and scope_id   = p_scope_id;
$$;

-- ---------------------------------------------------------------------------
-- upsert_forecast_override: inserta o actualiza el override de un empleado
-- ---------------------------------------------------------------------------
create or replace function public.upsert_forecast_override(
  p_scope_type    text,
  p_scope_id      text,
  p_employee_gui  text,
  p_hours_per_day float8,
  p_is_disabled   boolean
)
returns void
language sql
security definer
set search_path = te, public
as $$
  insert into te.forecast_employee_override
    (scope_type, scope_id, employee_gui, hours_per_day, is_disabled, updated_at)
  values
    (p_scope_type, p_scope_id, p_employee_gui, p_hours_per_day, p_is_disabled, now())
  on conflict (scope_type, scope_id, employee_gui) do update set
    hours_per_day = excluded.hours_per_day,
    is_disabled   = excluded.is_disabled,
    updated_at    = now();
$$;

-- ---------------------------------------------------------------------------
-- reset_forecast_overrides: elimina todos los overrides de un scope
-- ---------------------------------------------------------------------------
create or replace function public.reset_forecast_overrides(
  p_scope_type text,
  p_scope_id   text
)
returns void
language sql
security definer
set search_path = te, public
as $$
  delete from te.forecast_employee_override
  where scope_type = p_scope_type
    and scope_id   = p_scope_id;
$$;

grant execute on function public.get_forecast_overrides(text, text)                         to authenticated;
grant execute on function public.upsert_forecast_override(text, text, text, float8, boolean) to authenticated;
grant execute on function public.reset_forecast_overrides(text, text)                       to authenticated;
