-- =============================================================================
-- Funciones públicas para la aplicación XNE.
-- Se ejecutan con SECURITY DEFINER para poder acceder al esquema "te" desde
-- el cliente Supabase (PostgREST expone sólo "public" por defecto).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. KPI de engagements (lectura)
-- ---------------------------------------------------------------------------
create or replace function public.get_engagement_kpis()
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
  ter              float8
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
    (coalesce(v.ansr, 0) + coalesce(v.gasto_total, 0))::float8 as ter
  from v_engagement_pl v
  join dim_engagement  e on e.engagement_id  = v.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where coalesce(v.horas, 0) > 0 or coalesce(v.gasto_total, 0) > 0
  order by coalesce(v.ansr, 0) desc;
$$;

grant execute on function public.get_engagement_kpis() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Carga de tiempo y gastos (escritura)
--    Recibe dimensiones y filas de hechos como JSONB.
--    Hace upsert en dimensiones e insert con DO NOTHING en hechos.
--    Devuelve las estadísticas de inserción.
-- ---------------------------------------------------------------------------
create or replace function public.load_time_expense(
  p_clients         jsonb default '[]',
  p_opportunities   jsonb default '[]',
  p_projects        jsonb default '[]',
  p_engagements     jsonb default '[]',
  p_ranks           jsonb default '[]',
  p_grades          jsonb default '[]',
  p_employees       jsonb default '[]',
  p_vendors         jsonb default '[]',
  p_accounts        jsonb default '[]',
  p_activities      jsonb default '[]',
  p_categories      jsonb default '[]',
  p_ttypes          jsonb default '[]',
  p_time_rows       jsonb default '[]',
  p_expense_rows    jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = te, public
as $$
declare
  v_time_inserted    integer := 0;
  v_expense_inserted integer := 0;
begin

  -- ---- dimensiones --------------------------------------------------------

  insert into dim_client (client_id, client_name)
  select e->>'client_id', nullif(e->>'client_name', '')
  from jsonb_array_elements(p_clients) e
  on conflict (client_id) do update set client_name = excluded.client_name;

  insert into dim_opportunity (opportunity_id, opportunity_name, client_id)
  select e->>'opportunity_id', nullif(e->>'opportunity_name', ''), e->>'client_id'
  from jsonb_array_elements(p_opportunities) e
  on conflict (opportunity_id) do update
    set opportunity_name = excluded.opportunity_name,
        client_id        = excluded.client_id;

  insert into dim_project (project_id, project_name, opportunity_id)
  select e->>'project_id', nullif(e->>'project_name', ''), e->>'opportunity_id'
  from jsonb_array_elements(p_projects) e
  on conflict (project_id) do update
    set project_name   = excluded.project_name,
        opportunity_id = excluded.opportunity_id;

  insert into dim_engagement (engagement_id, engagement_name, project_id, service_line, country_region)
  select e->>'engagement_id', nullif(e->>'engagement_name', ''), e->>'project_id',
         nullif(e->>'service_line', ''), nullif(e->>'country_region', '')
  from jsonb_array_elements(p_engagements) e
  on conflict (engagement_id) do update
    set engagement_name = excluded.engagement_name,
        project_id      = excluded.project_id,
        service_line    = excluded.service_line,
        country_region  = excluded.country_region;

  insert into dim_rank (rank_code)
  select nullif(e->>'rank_code', '')
  from jsonb_array_elements(p_ranks) e
  where nullif(e->>'rank_code', '') is not null
  on conflict do nothing;

  insert into dim_grade (grade)
  select nullif(e->>'grade', '')
  from jsonb_array_elements(p_grades) e
  where nullif(e->>'grade', '') is not null
  on conflict do nothing;

  insert into dim_employee (employee_gui, employee_name, gds, cost_center,
                             employee_region, business_unit, rank_code, grade)
  select e->>'employee_gui',
         nullif(e->>'employee_name',  ''),
         nullif(e->>'gds',            ''),
         nullif(e->>'cost_center',    ''),
         nullif(e->>'employee_region',''),
         nullif(e->>'business_unit',  ''),
         nullif(e->>'rank_code',      ''),
         nullif(e->>'grade',          '')
  from jsonb_array_elements(p_employees) e
  on conflict (employee_gui) do update
    set employee_name   = excluded.employee_name,
        gds             = excluded.gds,
        cost_center     = excluded.cost_center,
        employee_region = excluded.employee_region,
        business_unit   = excluded.business_unit,
        rank_code       = excluded.rank_code,
        grade           = excluded.grade;

  insert into dim_vendor (vendor_id, vendor_name)
  select e->>'vendor_id', nullif(e->>'vendor_name', '')
  from jsonb_array_elements(p_vendors) e
  on conflict (vendor_id) do update set vendor_name = excluded.vendor_name;

  insert into dim_account (account_id, account_name)
  select e->>'account_id', nullif(e->>'account_name', '')
  from jsonb_array_elements(p_accounts) e
  on conflict (account_id) do update set account_name = excluded.account_name;

  insert into dim_activity (activity_code, activity_description)
  select e->>'activity_code', nullif(e->>'activity_description', '')
  from jsonb_array_elements(p_activities) e
  on conflict (activity_code) do update
    set activity_description = excluded.activity_description;

  insert into dim_category (category_code, category_description, sub_category_description)
  select e->>'category_code',
         nullif(e->>'category_description',     ''),
         nullif(e->>'sub_category_description', '')
  from jsonb_array_elements(p_categories) e
  on conflict (category_code) do update
    set category_description     = excluded.category_description,
        sub_category_description = excluded.sub_category_description;

  insert into dim_transaction_type (transaction_type_code)
  select nullif(e->>'transaction_type_code', '')
  from jsonb_array_elements(p_ttypes) e
  where nullif(e->>'transaction_type_code', '') is not null
  on conflict do nothing;

  -- ---- hecho: imputaciones de tiempo --------------------------------------

  with ins as (
    insert into fact_time_charge (
      engagement_id, employee_gui, rank_code, grade,
      transaction_date, accounting_date, week_ending_date,
      charged_hours, nsr_revenue, eaf_reserve_allocation, ansr_revenue,
      labor_cost, labor_cost_rate, tech_uplift_cost,
      tech_product_cost, tech_product_cost_rate,
      margin_cost, margin_cost_rate, rate_card_rate, rate_card_amount,
      activity_code, transaction_type_code, relieved_flag
    )
    select
      e->>'engagement_id',
      e->>'employee_gui',
      nullif(e->>'rank_code', ''),
      nullif(e->>'grade', ''),
      nullif(e->>'transaction_date', '')::date,
      nullif(e->>'accounting_date', '')::date,
      nullif(e->>'week_ending_date', '')::date,
      nullif(e->>'charged_hours',            '')::numeric,
      nullif(e->>'nsr_revenue',              '')::numeric,
      nullif(e->>'eaf_reserve_allocation',   '')::numeric,
      nullif(e->>'ansr_revenue',             '')::numeric,
      nullif(e->>'labor_cost',               '')::numeric,
      nullif(e->>'labor_cost_rate',          '')::numeric,
      nullif(e->>'tech_uplift_cost',         '')::numeric,
      nullif(e->>'tech_product_cost',        '')::numeric,
      nullif(e->>'tech_product_cost_rate',   '')::numeric,
      nullif(e->>'margin_cost',              '')::numeric,
      nullif(e->>'margin_cost_rate',         '')::numeric,
      nullif(e->>'rate_card_rate',           '')::numeric,
      nullif(e->>'rate_card_amount',         '')::numeric,
      nullif(e->>'activity_code', ''),
      coalesce(nullif(e->>'transaction_type_code', ''), 'Labor'),
      coalesce((e->>'relieved_flag')::boolean, false)
    from jsonb_array_elements(p_time_rows) e
    on conflict on constraint uq_time_charge do nothing
    returning id
  )
  select count(*) into v_time_inserted from ins;

  -- ---- hecho: gastos -------------------------------------------------------

  with ins as (
    insert into fact_expense (
      engagement_id, vendor_id, account_id, transaction_type_code,
      employee_gui, transaction_date, accounting_date, week_ending_date,
      expense_amount, expense_description, origin, destination,
      trip_id, journal_id, voucher_id, activity_code, category_code
    )
    select
      e->>'engagement_id',
      nullif(e->>'vendor_id',   ''),
      nullif(e->>'account_id',  ''),
      e->>'transaction_type_code',
      nullif(e->>'employee_gui', ''),
      nullif(e->>'transaction_date', '')::date,
      nullif(e->>'accounting_date',  '')::date,
      nullif(e->>'week_ending_date', '')::date,
      (e->>'expense_amount')::numeric,
      nullif(e->>'expense_description', ''),
      nullif(e->>'origin',      ''),
      nullif(e->>'destination', ''),
      nullif(e->>'trip_id',     ''),
      nullif(e->>'journal_id',  ''),
      nullif(e->>'voucher_id',  ''),
      nullif(e->>'activity_code', ''),
      nullif(e->>'category_code', '')
    from jsonb_array_elements(p_expense_rows) e
    on conflict do nothing
    returning id
  )
  select count(*) into v_expense_inserted from ins;

  return jsonb_build_object(
    'time_inserted',    v_time_inserted,
    'expense_inserted', v_expense_inserted
  );
end;
$$;

grant execute on function public.load_time_expense(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
