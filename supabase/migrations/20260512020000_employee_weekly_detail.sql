-- =============================================================================
-- RPCs para la vista de imputaciones semanales por empleado.
--
-- get_employees_list   → lista de empleados con imputaciones (para el selector)
-- get_employee_weekly_detail → detalle por empleado/engagement/semana/actividad
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lista de empleados
-- ---------------------------------------------------------------------------
create or replace function public.get_employees_list()
returns table (employee_gui text, employee_name text)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    tc.employee_gui,
    max(em.employee_name) as employee_name
  from fact_time_charge tc
  left join dim_employee em on em.employee_gui = tc.employee_gui
  group by tc.employee_gui
  order by max(em.employee_name) nulls last, tc.employee_gui;
$$;

grant execute on function public.get_employees_list() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Detalle semanal
--    Agrupa por (employee, engagement, semana, activity_code).
--    Si hay varias actividades en la misma semana/engagement el frontend
--    muestra cada actividad como sub-fila.
-- ---------------------------------------------------------------------------
create or replace function public.get_employee_weekly_detail(
  p_employee_guis text[],
  p_fiscal_year   integer default null
)
returns table (
  employee_gui    text,
  employee_name   text,
  engagement_id   text,
  engagement_name text,
  week_key        text,     -- YYYY-MM-DD (sábado = fin de semana)
  activity_code   text,
  charged_hours   float8,
  ansr_revenue    float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    tc.employee_gui,
    em.employee_name,
    tc.engagement_id,
    eng.engagement_name,
    coalesce(
      tc.week_ending_date,
      (date_trunc('week', tc.transaction_date) + interval '6 days')::date
    )::text                        as week_key,
    tc.activity_code,
    sum(tc.charged_hours)::float8  as charged_hours,
    sum(tc.ansr_revenue)::float8   as ansr_revenue
  from fact_time_charge tc
  left join dim_employee   em  on em.employee_gui   = tc.employee_gui
  left join dim_engagement eng on eng.engagement_id = tc.engagement_id
  where tc.employee_gui = any(p_employee_guis)
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(tc.accounting_date, tc.transaction_date)) = p_fiscal_year)
  group by
    tc.employee_gui, em.employee_name,
    tc.engagement_id, eng.engagement_name,
    5, tc.activity_code
  order by
    coalesce(em.employee_name, tc.employee_gui), tc.employee_gui,
    coalesce(eng.engagement_name, tc.engagement_id), tc.engagement_id,
    5, tc.activity_code;
$$;

grant execute on function public.get_employee_weekly_detail(text[], integer) to authenticated;
