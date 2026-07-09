-- =============================================================================
-- XNE — Esquema final de base de datos
-- Generado a partir de todas las migraciones (orden cronológico).
-- Ejecutar en Supabase SQL Editor en una instalación nueva.
-- =============================================================================

-- =============================================================================
-- 0. ESQUEMA
-- =============================================================================
create schema if not exists te;
set search_path = te, public;

-- =============================================================================
-- 1. TABLAS DIMENSIONALES
-- =============================================================================

create table if not exists te.dim_client (
  client_id     text primary key,
  client_name   text not null,
  color         text,
  business_unit text default 'Studio+'
    check (business_unit in ('Studio+', 'Hospitality'))
);

create table if not exists te.dim_opportunity (
  opportunity_id   text primary key,
  opportunity_name text,
  client_id        text not null references te.dim_client (client_id)
);

create table if not exists te.dim_project (
  project_id     text primary key,
  project_name   text,
  opportunity_id text not null references te.dim_opportunity (opportunity_id)
);

create table if not exists te.dim_engagement (
  engagement_id   text primary key,
  engagement_name text,
  project_id      text not null references te.dim_project (project_id),
  service_line    text,
  country_region  text,
  currency_code   text default 'EUR'
);

create table if not exists te.dim_rank (
  rank_code text primary key
);

create table if not exists te.dim_grade (
  grade text primary key
);

create table if not exists te.dim_employee (
  employee_gui    text primary key,
  employee_name   text,
  gds             text,
  cost_center     text,
  employee_region text,
  business_unit   text,
  rank_code       text references te.dim_rank (rank_code),
  grade           text references te.dim_grade (grade)
);

create table if not exists te.dim_vendor (
  vendor_id   text primary key,
  vendor_name text,
  color       text
);

create table if not exists te.dim_account (
  account_id   text primary key,
  account_name text
);

create table if not exists te.dim_transaction_type (
  transaction_type_code text primary key
);

create table if not exists te.dim_activity (
  activity_code        text primary key,
  activity_description text
);

create table if not exists te.dim_category (
  category_code             text primary key,
  category_description      text,
  sub_category_description  text
);

-- =============================================================================
-- 2. SEMILLAS (datos mínimos)
-- =============================================================================
insert into te.dim_transaction_type (transaction_type_code) values
  ('Labor'),
  ('AP (FB60 Solution) Expense'),
  ('Travel Expense')
on conflict do nothing;

insert into te.dim_rank (rank_code) values
  ('Staff/Assistant'),
  ('Senior'),
  ('Manager'),
  ('Senior Manager'),
  ('Partner/Principal')
on conflict do nothing;

insert into te.dim_grade (grade) values ('1'), ('2'), ('3')
on conflict do nothing;

-- Stub para engagements que solo aparecen en forecast
insert into te.dim_client     (client_id,      client_name)
  values ('_FORECAST_', 'Forecast Only')
  on conflict do nothing;
insert into te.dim_opportunity (opportunity_id, opportunity_name, client_id)
  values ('_FORECAST_', 'Forecast Only', '_FORECAST_')
  on conflict do nothing;
insert into te.dim_project     (project_id,     project_name,     opportunity_id)
  values ('_FORECAST_', 'Forecast Only', '_FORECAST_')
  on conflict do nothing;

-- =============================================================================
-- 3. TABLAS DE HECHOS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3a. Imputaciones de tiempo
-- ---------------------------------------------------------------------------
create table if not exists te.fact_time_charge (
  id                      bigserial primary key,
  engagement_id           text not null references te.dim_engagement   (engagement_id),
  employee_gui            text not null references te.dim_employee     (employee_gui),
  rank_code               text references te.dim_rank (rank_code),
  grade                   text references te.dim_grade (grade),
  transaction_date        date not null,
  accounting_date         date,
  week_ending_date        date,
  charged_hours           numeric(12,4),
  nsr_revenue             numeric(14,2),
  eaf_reserve_allocation  numeric(14,4),
  ansr_revenue            numeric(14,2),
  labor_cost              numeric(14,2),
  labor_cost_rate         numeric(14,4),
  tech_uplift_cost        numeric(14,4),
  tech_product_cost       numeric(14,2),
  tech_product_cost_rate  numeric(14,4),
  margin_cost             numeric(14,2),
  margin_cost_rate        numeric(14,4),
  rate_card_rate          numeric(14,4),
  rate_card_amount        numeric(14,2),
  activity_code           text references te.dim_activity         (activity_code),
  transaction_type_code   text references te.dim_transaction_type (transaction_type_code) default 'Labor',
  relieved_flag           boolean default false,
  currency_code           text default 'EUR',
  loaded_at               timestamptz default now(),
  -- Clave única: misma imputación puede tener horas positivas y negativas (corrección)
  constraint uq_time_charge unique (engagement_id, employee_gui, transaction_date, activity_code, charged_hours)
);

create index if not exists ix_tc_engagement_date on te.fact_time_charge (engagement_id, accounting_date);
create index if not exists ix_tc_employee        on te.fact_time_charge (employee_gui);
create index if not exists ix_tc_week            on te.fact_time_charge (week_ending_date);

-- ---------------------------------------------------------------------------
-- 3b. Gastos
-- ---------------------------------------------------------------------------
create table if not exists te.fact_expense (
  id                    bigserial primary key,
  engagement_id         text not null references te.dim_engagement        (engagement_id),
  vendor_id             text references te.dim_vendor   (vendor_id),
  account_id            text references te.dim_account  (account_id),
  transaction_type_code text not null references te.dim_transaction_type  (transaction_type_code),
  employee_gui          text references te.dim_employee (employee_gui),
  transaction_date      date,
  accounting_date       date,
  week_ending_date      date,
  expense_amount        numeric(14,2) not null,
  expense_description   text,
  origin                text,
  destination           text,
  trip_id               text,
  journal_id            text,
  voucher_id            text,
  activity_code         text references te.dim_activity (activity_code),
  category_code         text references te.dim_category (category_code),
  currency_code         text default 'EUR',
  loaded_at             timestamptz default now()
);

-- Clave única con voucher (puede tener múltiples líneas por PO con distinto importe)
create unique index if not exists uq_expense_voucher
  on te.fact_expense (engagement_id, voucher_id, expense_amount, coalesce(expense_description, ''))
  where voucher_id is not null;

-- Clave natural sin voucher
create unique index if not exists uq_expense_natural
  on te.fact_expense (
    engagement_id,
    coalesce(vendor_id, ''),
    transaction_type_code,
    transaction_date,
    expense_amount,
    coalesce(accounting_date, '1970-01-01'::date),
    coalesce(expense_description, '')
  )
  where voucher_id is null;

create index if not exists ix_ex_engagement_type on te.fact_expense (engagement_id, transaction_type_code);
create index if not exists ix_ex_vendor          on te.fact_expense (vendor_id);
create index if not exists ix_ex_accounting_date on te.fact_expense (accounting_date);

-- ---------------------------------------------------------------------------
-- 3c. Forecast semanal por empleado/engagement
-- ---------------------------------------------------------------------------
create table if not exists te.fact_forecast_week (
  id              bigserial    primary key,
  employee_gui    text         not null,
  engagement_id   text         not null,
  week_start_date date         not null,
  effective_hours float8,
  billable_hours  float8,
  loaded_at       timestamptz  not null default now()
);

create unique index if not exists uq_forecast_week
  on te.fact_forecast_week (employee_gui, engagement_id, week_start_date);

-- =============================================================================
-- 4. TABLA DE SOPORTE (no se borra al truncar hechos)
-- =============================================================================

-- Presupuesto y estado de cada engagement (sobrevive al truncate_all_data)
create table if not exists te.engagement_budget (
  engagement_id text primary key,
  budget        numeric(14,2) not null default 0,
  status        text not null default 'activo'
    check (status in ('activo', 'cerrado')),
  updated_at    timestamptz default now()
);

-- Overrides del forecast por empleado (engagement o cliente)
create table if not exists te.forecast_employee_override (
  scope_type    text    not null,   -- 'engagement' | 'client'
  scope_id      text    not null,
  employee_gui  text    not null,
  hours_per_day float8,
  is_disabled   boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (scope_type, scope_id, employee_gui)
);

-- =============================================================================
-- 5. VISTAS ANALÍTICAS
-- =============================================================================

create or replace view te.v_engagement_pl as
select e.engagement_id,
       e.engagement_name,
       coalesce(t.horas,        0)                        as horas,
       coalesce(t.nsr,          0)                        as nsr,
       coalesce(t.ansr,         0)                        as ansr,
       coalesce(t.coste_margen, 0)                        as coste_margen,
       coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0) as margen_bruto,
       coalesce(x.gasto_total,  0)                        as gasto_total
from te.dim_engagement e
left join (
  select engagement_id,
         sum(charged_hours) as horas,
         sum(nsr_revenue)   as nsr,
         sum(ansr_revenue)  as ansr,
         sum(margin_cost)   as coste_margen
  from te.fact_time_charge
  group by engagement_id
) t using (engagement_id)
left join (
  select engagement_id,
         sum(expense_amount) as gasto_total
  from te.fact_expense
  group by engagement_id
) x using (engagement_id);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
alter table te.dim_client              enable row level security;
alter table te.dim_opportunity         enable row level security;
alter table te.dim_project             enable row level security;
alter table te.dim_engagement          enable row level security;
alter table te.dim_employee            enable row level security;
alter table te.dim_vendor              enable row level security;
alter table te.dim_account             enable row level security;
alter table te.fact_time_charge        enable row level security;
alter table te.fact_expense            enable row level security;
alter table te.engagement_budget       enable row level security;
alter table te.fact_forecast_week      enable row level security;
alter table te.forecast_employee_override enable row level security;

-- Política de lectura: usuarios autenticados pueden leer todo
do $$
declare t text;
begin
  for t in select unnest(array[
    'dim_client','dim_opportunity','dim_project','dim_engagement',
    'dim_employee','dim_vendor','dim_account',
    'fact_time_charge','fact_expense','fact_forecast_week'
  ])
  loop
    execute format(
      'create policy %I on te.%I for select to authenticated using (true);',
      'read_'||t, t
    );
  end loop;
end$$;

create policy "read_engagement_budget"
  on te.engagement_budget for select to authenticated using (true);
create policy "write_engagement_budget"
  on te.engagement_budget for all to authenticated using (true) with check (true);

grant select, insert, update, delete on te.fact_forecast_week to authenticated;
grant usage, select on sequence te.fact_forecast_week_id_seq to authenticated;

-- =============================================================================
-- 7. HELPER INTERNO
-- =============================================================================

-- fiscal_year(date): FY = año que termina en junio
-- FY2026 = 1 Jul 2025 – 30 Jun 2026
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

-- =============================================================================
-- 8. FUNCIONES PÚBLICAS (RPCs para PostgREST / Supabase JS)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Años fiscales disponibles
-- ---------------------------------------------------------------------------
create or replace function public.get_fiscal_years()
returns table (fiscal_year integer)
language sql security definer stable
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
-- KPIs por engagement (versión final con FY + active_only + business_unit)
-- ---------------------------------------------------------------------------
create or replace function public.get_engagement_kpis(
  p_fiscal_year   integer default null,
  p_active_only   boolean default false,
  p_business_unit text    default null
)
returns table (
  client_name     text,
  project_name    text,
  engagement_id   text,
  engagement_name text,
  horas           float8,
  nsr             float8,
  ansr            float8,
  coste_margen    float8,
  margen_bruto    float8,
  gasto_total     float8,
  ter             float8,
  budget          float8,
  status          text
)
language sql security definer stable
set search_path = te, public
as $$
  with tc as (
    select engagement_id,
           sum(charged_hours) as horas, sum(nsr_revenue) as nsr,
           sum(ansr_revenue) as ansr,   sum(margin_cost)  as coste_margen
    from fact_time_charge
    where (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  ),
  ex as (
    select engagement_id, sum(expense_amount) as gasto_total
    from fact_expense
    where (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  )
  select c.client_name, p.project_name, e.engagement_id, e.engagement_name,
    coalesce(tc.horas,        0)::float8,
    coalesce(tc.nsr,          0)::float8,
    coalesce(tc.ansr,         0)::float8,
    coalesce(tc.coste_margen, 0)::float8,
    (coalesce(tc.ansr, 0) - coalesce(tc.coste_margen, 0))::float8,
    coalesce(ex.gasto_total,  0)::float8,
    (coalesce(tc.ansr, 0) + coalesce(ex.gasto_total, 0))::float8,
    b.budget::float8,
    coalesce(b.status, 'activo')
  from dim_engagement  e
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = e.engagement_id
  left join ex on ex.engagement_id = e.engagement_id
  left join engagement_budget b on b.engagement_id = e.engagement_id
  where (coalesce(tc.horas, 0) > 0 or coalesce(ex.gasto_total, 0) > 0)
    and (not p_active_only or coalesce(b.status, 'activo') = 'activo')
    and (p_business_unit is null or c.business_unit = p_business_unit)
  order by coalesce(tc.ansr, 0) desc;
$$;
grant execute on function public.get_engagement_kpis(integer, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- KPIs por cliente (versión final, excluye engagements cerrados)
-- ---------------------------------------------------------------------------
create or replace function public.get_client_kpis(p_fiscal_year integer default null)
returns table (
  client_id     text, client_name   text, n_engagements bigint,
  horas         float8, nsr         float8, ansr          float8,
  coste_margen  float8, margen_bruto float8, gasto_total  float8,
  ter           float8, budget       float8
)
language sql security definer stable
set search_path = te, public
as $$
  with active_engagements as (
    select e.engagement_id
    from   dim_engagement  e
    left join engagement_budget b on b.engagement_id = e.engagement_id
    where  coalesce(b.status, 'activo') <> 'cerrado'
  ),
  tc as (
    select engagement_id,
           sum(charged_hours) as horas, sum(nsr_revenue) as nsr,
           sum(ansr_revenue)  as ansr,  sum(margin_cost)  as coste_margen
    from fact_time_charge
    where engagement_id in (select engagement_id from active_engagements)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  ),
  ex as (
    select engagement_id, sum(expense_amount) as gasto_total
    from fact_expense
    where engagement_id in (select engagement_id from active_engagements)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  )
  select c.client_id, c.client_name,
    count(distinct e.engagement_id)::bigint,
    coalesce(sum(tc.horas),        0)::float8,
    coalesce(sum(tc.nsr),          0)::float8,
    coalesce(sum(tc.ansr),         0)::float8,
    coalesce(sum(tc.coste_margen), 0)::float8,
    coalesce(sum(tc.ansr) - sum(tc.coste_margen), 0)::float8,
    coalesce(sum(ex.gasto_total),  0)::float8,
    coalesce(sum(tc.ansr) + sum(ex.gasto_total), 0)::float8,
    sum(b.budget)::float8
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

-- ---------------------------------------------------------------------------
-- KPIs mensuales por engagement
-- ---------------------------------------------------------------------------
create or replace function public.get_project_monthly_kpis(
  p_engagement_id text,
  p_fiscal_year   integer default null
)
returns table (
  mes text, horas float8, nsr float8, ansr float8,
  coste_margen float8, margen_bruto float8, gasto_total float8, ter float8
)
language sql security definer stable
set search_path = te, public
as $$
  with tm as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           sum(charged_hours) as horas, sum(nsr_revenue) as nsr,
           sum(ansr_revenue)  as ansr,  sum(margin_cost)  as coste_margen
    from fact_time_charge
    where engagement_id = p_engagement_id
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  xm as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           sum(expense_amount) as gasto_total
    from fact_expense
    where engagement_id = p_engagement_id
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  all_m as (select mes from tm union select mes from xm)
  select m.mes,
    coalesce(t.horas, 0)::float8, coalesce(t.nsr, 0)::float8,
    coalesce(t.ansr, 0)::float8,  coalesce(t.coste_margen, 0)::float8,
    (coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0))::float8,
    coalesce(x.gasto_total, 0)::float8,
    (coalesce(t.ansr, 0) + coalesce(x.gasto_total, 0))::float8
  from all_m m left join tm t using (mes) left join xm x using (mes)
  order by m.mes;
$$;
grant execute on function public.get_project_monthly_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- KPIs mensuales por cliente (excluye cerrados)
-- ---------------------------------------------------------------------------
create or replace function public.get_client_monthly_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  mes text, horas float8, nsr float8, ansr float8,
  coste_margen float8, margen_bruto float8, gasto_total float8, ter float8
)
language sql security definer stable
set search_path = te, public
as $$
  with eids as (
    select e.engagement_id
    from   dim_engagement  e
    join   dim_project     p on p.project_id     = e.project_id
    join   dim_opportunity o on o.opportunity_id = p.opportunity_id
    left join engagement_budget b on b.engagement_id = e.engagement_id
    where  o.client_id = p_client_id
      and  coalesce(b.status, 'activo') <> 'cerrado'
  ),
  tm as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           sum(charged_hours) as horas, sum(nsr_revenue) as nsr,
           sum(ansr_revenue)  as ansr,  sum(margin_cost)  as coste_margen
    from fact_time_charge
    where engagement_id in (select engagement_id from eids)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  xm as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           sum(expense_amount) as gasto_total
    from fact_expense
    where engagement_id in (select engagement_id from eids)
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1
  ),
  all_m as (select mes from tm union select mes from xm)
  select m.mes,
    coalesce(t.horas, 0)::float8, coalesce(t.nsr, 0)::float8,
    coalesce(t.ansr, 0)::float8,  coalesce(t.coste_margen, 0)::float8,
    (coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0))::float8,
    coalesce(x.gasto_total, 0)::float8,
    (coalesce(t.ansr, 0) + coalesce(x.gasto_total, 0))::float8
  from all_m m left join tm t using (mes) left join xm x using (mes)
  order by m.mes;
$$;
grant execute on function public.get_client_monthly_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- KPIs mensuales por empleado para un engagement
-- ---------------------------------------------------------------------------
create or replace function public.get_project_employee_monthly_kpis(
  p_engagement_id text,
  p_fiscal_year   integer default null
)
returns table (
  mes text, employee_gui text, employee_name text, rank_code text,
  horas float8, nsr float8, ansr float8, coste_margen float8, margen_bruto float8
)
language sql security definer stable
set search_path = te, public
as $$
  select
    to_char(coalesce(t.accounting_date, t.transaction_date), 'YYYY-MM') as mes,
    t.employee_gui, e.employee_name, t.rank_code,
    sum(t.charged_hours)::float8,                        sum(t.nsr_revenue)::float8,
    sum(t.ansr_revenue)::float8,                         sum(t.margin_cost)::float8,
    (sum(t.ansr_revenue) - sum(t.margin_cost))::float8
  from fact_time_charge t
  left join dim_employee e on e.employee_gui = t.employee_gui
  where t.engagement_id = p_engagement_id
    and coalesce(t.charged_hours, 0) > 0
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(t.accounting_date, t.transaction_date)) = p_fiscal_year)
  group by 1, 2, 3, 4
  order by 1, 5 desc;
$$;
grant execute on function public.get_project_employee_monthly_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Gastos por vendor de un engagement
-- ---------------------------------------------------------------------------
create or replace function public.get_engagement_expenses_by_vendor(p_engagement_id text)
returns table (
  vendor_id text, vendor_name text, transaction_type_code text,
  category_description text, total_gasto float8, n_lineas bigint
)
language sql security definer stable
set search_path = te, public
as $$
  select coalesce(x.vendor_id, '—'), coalesce(v.vendor_name, '(sin vendor)'),
         x.transaction_type_code,    coalesce(cat.category_description, '—'),
         sum(x.expense_amount)::float8, count(*)::bigint
  from fact_expense x
  left join dim_vendor   v   on v.vendor_id     = x.vendor_id
  left join dim_category cat on cat.category_code = x.category_code
  where x.engagement_id = p_engagement_id
  group by x.vendor_id, v.vendor_name, x.transaction_type_code, cat.category_description
  order by 5 desc;
$$;
grant execute on function public.get_engagement_expenses_by_vendor(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Gastos por vendor de un cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_client_expenses_by_vendor(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  vendor_id text, vendor_name text, transaction_type_code text,
  category_description text, total_gasto float8, n_lineas bigint
)
language sql security definer stable
set search_path = te, public
as $$
  select coalesce(x.vendor_id, '—'), coalesce(v.vendor_name, '(sin vendor)'),
         x.transaction_type_code,    coalesce(cat.category_description, '—'),
         sum(x.expense_amount)::float8, count(*)::bigint
  from fact_expense x
  join dim_engagement  e   on e.engagement_id   = x.engagement_id
  join dim_project     p   on p.project_id      = e.project_id
  join dim_opportunity o   on o.opportunity_id  = p.opportunity_id
  join dim_client      c   on c.client_id       = o.client_id
  left join dim_vendor   v   on v.vendor_id     = x.vendor_id
  left join dim_category cat on cat.category_code = x.category_code
  where c.client_id = p_client_id
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
  group by x.vendor_id, v.vendor_name, x.transaction_type_code, cat.category_description
  order by 5 desc;
$$;
grant execute on function public.get_client_expenses_by_vendor(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- KPIs por engagement de un cliente (vista Cliente)
-- ---------------------------------------------------------------------------
create or replace function public.get_client_engagement_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  engagement_id text, engagement_name text, project_name text,
  horas float8, nsr float8, ansr float8, coste_margen float8,
  margen_bruto float8, gasto_total float8, ter float8, budget float8, status text
)
language sql security definer stable
set search_path = te, public
as $$
  with tc as (
    select engagement_id,
           sum(charged_hours) as horas, sum(nsr_revenue) as nsr,
           sum(ansr_revenue)  as ansr,  sum(margin_cost)  as coste_margen
    from fact_time_charge
    where (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  ),
  ex as (
    select engagement_id, sum(expense_amount) as gasto_total
    from fact_expense
    where (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  )
  select e.engagement_id, e.engagement_name, p.project_name,
    coalesce(tc.horas, 0)::float8,        coalesce(tc.nsr, 0)::float8,
    coalesce(tc.ansr, 0)::float8,         coalesce(tc.coste_margen, 0)::float8,
    coalesce(tc.ansr - tc.coste_margen, 0)::float8,
    coalesce(ex.gasto_total, 0)::float8,
    (coalesce(tc.ansr, 0) + coalesce(ex.gasto_total, 0))::float8,
    b.budget::float8,
    coalesce(b.status, 'activo')
  from dim_engagement  e
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = e.engagement_id
  left join ex on ex.engagement_id = e.engagement_id
  left join engagement_budget b on b.engagement_id = e.engagement_id
  where c.client_id = p_client_id
    and (coalesce(tc.horas, 0) > 0 or coalesce(ex.gasto_total, 0) > 0)
  order by coalesce(tc.ansr, 0) desc;
$$;
grant execute on function public.get_client_engagement_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Líneas de gasto individuales de un cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_client_expense_lines(
  p_client_id             text,
  p_vendor_id             text    default null,
  p_transaction_type_code text    default null,
  p_category_description  text    default null,
  p_fiscal_year           integer default null
)
returns table (
  engagement_name text, vendor_name text, transaction_type_code text,
  category_description text, expense_description text,
  transaction_date date, accounting_date date, expense_amount float8, voucher_id text
)
language sql security definer stable
set search_path = te, public
as $$
  select e.engagement_name, coalesce(v.vendor_name, '(sin vendor)'),
         x.transaction_type_code, coalesce(cat.category_description, '—'),
         x.expense_description, x.transaction_date, x.accounting_date,
         x.expense_amount::float8, x.voucher_id
  from fact_expense x
  join dim_engagement  e   on e.engagement_id   = x.engagement_id
  join dim_project     p   on p.project_id      = e.project_id
  join dim_opportunity o   on o.opportunity_id  = p.opportunity_id
  join dim_client      c   on c.client_id       = o.client_id
  left join dim_vendor   v   on v.vendor_id     = x.vendor_id
  left join dim_category cat on cat.category_code = x.category_code
  where c.client_id = p_client_id
    and (p_vendor_id             is null or coalesce(x.vendor_id, '—')               = p_vendor_id)
    and (p_transaction_type_code is null or x.transaction_type_code                  = p_transaction_type_code)
    and (p_category_description  is null or coalesce(cat.category_description, '—') = p_category_description)
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
  order by coalesce(x.accounting_date, x.transaction_date) desc nulls last;
$$;
grant execute on function public.get_client_expense_lines(text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- ANSR mensual desglosado por engagement para un cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_client_engagement_monthly_ansr(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (mes text, engagement_id text, engagement_name text, ansr float8)
language sql security definer stable
set search_path = te, public
as $$
  select to_char(coalesce(t.accounting_date, t.transaction_date), 'YYYY-MM'),
         e.engagement_id, coalesce(e.engagement_name, e.engagement_id),
         sum(t.ansr_revenue)::float8
  from fact_time_charge t
  join dim_engagement  e on e.engagement_id  = t.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where c.client_id = p_client_id and coalesce(t.ansr_revenue, 0) <> 0
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(t.accounting_date, t.transaction_date)) = p_fiscal_year)
  group by 1, 2, 3 order by 1, 4 desc;
$$;
grant execute on function public.get_client_engagement_monthly_ansr(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Gastos mensuales por proveedor de un cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_client_vendor_monthly_expenses(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (mes text, vendor_id text, vendor_name text, color text, gasto_total float8)
language sql security definer stable
set search_path = te, public
as $$
  select to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM'),
         coalesce(x.vendor_id, '—'), coalesce(v.vendor_name, '(sin vendor)'),
         v.color, sum(x.expense_amount)::float8
  from fact_expense x
  join dim_engagement  e on e.engagement_id   = x.engagement_id
  join dim_project     p on p.project_id      = e.project_id
  join dim_opportunity o on o.opportunity_id  = p.opportunity_id
  join dim_client      c on c.client_id       = o.client_id
  left join dim_vendor v on v.vendor_id       = x.vendor_id
  where c.client_id = p_client_id
    and coalesce(x.accounting_date, x.transaction_date) is not null
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
  group by 1, 2, 3, 4 order by 1, 5 desc;
$$;
grant execute on function public.get_client_vendor_monthly_expenses(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- KPIs semanales de un cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_client_weekly_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (week_key text, charged_hours float8, ansr_revenue float8)
language sql security definer stable
set search_path = te, public
as $$
  select (date_trunc('week', coalesce(tc.week_ending_date, tc.transaction_date))
           + interval '6 days')::date::text,
         sum(tc.charged_hours)::float8, sum(tc.ansr_revenue)::float8
  from fact_time_charge tc
  join dim_engagement  e on e.engagement_id   = tc.engagement_id
  join dim_project     p on p.project_id      = e.project_id
  join dim_opportunity o on o.opportunity_id  = p.opportunity_id
  join dim_client      c on c.client_id       = o.client_id
  where c.client_id = p_client_id
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(tc.accounting_date, tc.transaction_date)) = p_fiscal_year)
  group by 1 order by 1;
$$;
grant execute on function public.get_client_weekly_kpis(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- TER mensual global por cliente (con filtro de business_unit)
-- ---------------------------------------------------------------------------
create or replace function public.get_global_monthly_ter_by_client(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (mes text, client_id text, client_name text, color text, ter float8)
language sql security definer stable
set search_path = te, public
as $$
  with tc as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           engagement_id, sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  ex as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           engagement_id, sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  aem as (select mes, engagement_id from tc union select mes, engagement_id from ex)
  select aem.mes, c.client_id, c.client_name, c.color,
    (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0))::float8
  from aem
  join dim_engagement  e on e.engagement_id  = aem.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.engagement_id = aem.engagement_id and tc.mes = aem.mes
  left join ex on ex.engagement_id = aem.engagement_id and ex.mes = aem.mes
  where (p_business_unit is null or c.business_unit = p_business_unit)
  group by aem.mes, c.client_id, c.client_name, c.color
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by 1, 5 desc;
$$;
grant execute on function public.get_global_monthly_ter_by_client(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- TER trimestral global por cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_global_quarterly_ter_by_client(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  quarter text, quarter_sort text, client_id text, client_name text, color text,
  ansr float8, gastos float8
)
language sql security definer stable
set search_path = te, public
as $$
  with tc as (
    select date_trunc('quarter', coalesce(accounting_date, transaction_date)) as qstart,
           engagement_id, sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  ex as (
    select date_trunc('quarter', coalesce(accounting_date, transaction_date)) as qstart,
           engagement_id, sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  ap as (select qstart, engagement_id from tc union select qstart, engagement_id from ex)
  select
    'Q' || extract(quarter from ap.qstart)::int || ' ' || extract(year from ap.qstart)::int,
    to_char(ap.qstart, 'YYYY') || '-Q' || extract(quarter from ap.qstart)::int::text,
    c.client_id, c.client_name, c.color,
    coalesce(sum(tc.ansr),   0)::float8,
    coalesce(sum(ex.gastos), 0)::float8
  from ap
  join dim_engagement  e on e.engagement_id  = ap.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.qstart = ap.qstart and tc.engagement_id = ap.engagement_id
  left join ex on ex.qstart = ap.qstart and ex.engagement_id = ap.engagement_id
  where (p_business_unit is null or c.business_unit = p_business_unit)
  group by ap.qstart, c.client_id, c.client_name, c.color
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by 2, c.client_name;
$$;
grant execute on function public.get_global_quarterly_ter_by_client(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- TER mensual global desglosado (ANSR + Gastos)
-- ---------------------------------------------------------------------------
create or replace function public.get_global_monthly_ter_breakdown(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (mes text, ansr float8, gastos float8)
language sql security definer stable
set search_path = te, public
as $$
  with bu_eng as (
    select e.engagement_id from dim_engagement e
    join dim_project p on p.project_id = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    join dim_client c on c.client_id = o.client_id
    where (p_business_unit is null or c.business_unit = p_business_unit)
  ),
  tc as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
      and (p_business_unit is null or engagement_id in (select engagement_id from bu_eng))
    group by 1
  ),
  ex as (
    select to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
           sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
      and (p_business_unit is null or engagement_id in (select engagement_id from bu_eng))
    group by 1
  ),
  months as (select mes from tc union select mes from ex)
  select m.mes, coalesce(tc.ansr, 0)::float8, coalesce(ex.gastos, 0)::float8
  from months m left join tc on tc.mes = m.mes left join ex on ex.mes = m.mes
  order by 1;
$$;
grant execute on function public.get_global_monthly_ter_breakdown(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Gastos mensuales globales por proveedor
-- ---------------------------------------------------------------------------
create or replace function public.get_global_monthly_expenses_by_vendor(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (mes text, vendor_id text, vendor_name text, color text, gasto_total float8)
language sql security definer stable
set search_path = te, public
as $$
  with bu_eng as (
    select e.engagement_id from dim_engagement e
    join dim_project p on p.project_id = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    join dim_client c on c.client_id = o.client_id
    where (p_business_unit is null or c.business_unit = p_business_unit)
  )
  select to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM'),
         coalesce(x.vendor_id, '—'), coalesce(v.vendor_name, '(sin vendor)'),
         v.color, sum(x.expense_amount)::float8
  from fact_expense x
  left join dim_vendor v on v.vendor_id = x.vendor_id
  where coalesce(x.accounting_date, x.transaction_date) is not null
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
    and (p_business_unit is null or x.engagement_id in (select engagement_id from bu_eng))
  group by 1, 2, 3, 4 order by 1, 5 desc;
$$;
grant execute on function public.get_global_monthly_expenses_by_vendor(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Gastos mensuales globales por cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_global_monthly_expenses_by_client(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (mes text, client_id text, client_name text, color text, gasto_total float8)
language sql security definer stable
set search_path = te, public
as $$
  with ex as (
    select to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as mes,
           x.engagement_id, sum(x.expense_amount) as gastos
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
    group by 1, 2
  )
  select ex.mes, c.client_id, c.client_name, c.color, sum(ex.gastos)::float8
  from ex
  join dim_engagement  e on e.engagement_id  = ex.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where (p_business_unit is null or c.business_unit = p_business_unit)
  group by ex.mes, c.client_id, c.client_name, c.color
  having sum(ex.gastos) <> 0 order by 1, 5 desc;
$$;
grant execute on function public.get_global_monthly_expenses_by_client(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Parámetros de forecast por engagement y por cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_engagement_forecast_params(
  p_engagement_id text,
  p_fiscal_year   integer default null
)
returns table (headcount integer, last_date date)
language sql security definer stable
set search_path = te, public
as $$
  select count(distinct employee_gui)::integer,
         max(coalesce(accounting_date, transaction_date))::date
  from fact_time_charge
  where engagement_id = p_engagement_id and coalesce(charged_hours, 0) > 0
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year);
$$;
grant execute on function public.get_engagement_forecast_params(text, integer) to authenticated;

create or replace function public.get_client_forecast_params(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (headcount integer, last_date date)
language sql security definer stable
set search_path = te, public
as $$
  select count(distinct t.employee_gui)::integer,
         max(coalesce(t.accounting_date, t.transaction_date))::date
  from fact_time_charge t
  join dim_engagement  e on e.engagement_id  = t.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  where o.client_id = p_client_id and coalesce(t.charged_hours, 0) > 0
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(t.accounting_date, t.transaction_date)) = p_fiscal_year);
$$;
grant execute on function public.get_client_forecast_params(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Overrides del forecast por empleado
-- ---------------------------------------------------------------------------
create or replace function public.get_forecast_overrides(p_scope_type text, p_scope_id text)
returns table (employee_gui text, hours_per_day float8, is_disabled boolean)
language sql security definer stable
set search_path = te, public
as $$
  select employee_gui, hours_per_day, is_disabled
  from te.forecast_employee_override
  where scope_type = p_scope_type and scope_id = p_scope_id;
$$;

create or replace function public.upsert_forecast_override(
  p_scope_type text, p_scope_id text, p_employee_gui text,
  p_hours_per_day float8, p_is_disabled boolean
)
returns void language sql security definer
set search_path = te, public
as $$
  insert into te.forecast_employee_override
    (scope_type, scope_id, employee_gui, hours_per_day, is_disabled, updated_at)
  values (p_scope_type, p_scope_id, p_employee_gui, p_hours_per_day, p_is_disabled, now())
  on conflict (scope_type, scope_id, employee_gui) do update set
    hours_per_day = excluded.hours_per_day,
    is_disabled   = excluded.is_disabled,
    updated_at    = now();
$$;

create or replace function public.reset_forecast_overrides(p_scope_type text, p_scope_id text)
returns void language sql security definer
set search_path = te, public
as $$
  delete from te.forecast_employee_override
  where scope_type = p_scope_type and scope_id = p_scope_id;
$$;

grant execute on function public.get_forecast_overrides(text, text) to authenticated;
grant execute on function public.upsert_forecast_override(text, text, text, float8, boolean) to authenticated;
grant execute on function public.reset_forecast_overrides(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lista de empleados con imputaciones reales
-- ---------------------------------------------------------------------------
create or replace function public.get_employees_list()
returns table (employee_gui text, employee_name text)
language sql security definer stable
set search_path = te, public
as $$
  select tc.employee_gui, max(em.employee_name)
  from fact_time_charge tc
  left join dim_employee em on em.employee_gui = tc.employee_gui
  group by tc.employee_gui
  order by max(em.employee_name) nulls last, tc.employee_gui;
$$;
grant execute on function public.get_employees_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Detalle semanal de imputaciones por empleado
-- ---------------------------------------------------------------------------
create or replace function public.get_employee_weekly_detail(
  p_employee_guis text[],
  p_fiscal_year   integer default null
)
returns table (
  employee_gui text, employee_name text, engagement_id text, engagement_name text,
  week_key text, activity_code text, charged_hours float8, ansr_revenue float8
)
language sql security definer stable
set search_path = te, public
as $$
  select tc.employee_gui, em.employee_name, tc.engagement_id, eng.engagement_name,
    coalesce(tc.week_ending_date,
             (date_trunc('week', tc.transaction_date) + interval '6 days')::date)::text,
    tc.activity_code,
    sum(tc.charged_hours)::float8, sum(tc.ansr_revenue)::float8
  from fact_time_charge tc
  left join dim_employee   em  on em.employee_gui   = tc.employee_gui
  left join dim_engagement eng on eng.engagement_id = tc.engagement_id
  where tc.employee_gui = any(p_employee_guis)
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(tc.accounting_date, tc.transaction_date)) = p_fiscal_year)
  group by tc.employee_gui, em.employee_name, tc.engagement_id, eng.engagement_name, 5, tc.activity_code
  order by coalesce(em.employee_name, tc.employee_gui), tc.employee_gui,
           coalesce(eng.engagement_name, tc.engagement_id), tc.engagement_id, 5, tc.activity_code;
$$;
grant execute on function public.get_employee_weekly_detail(text[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Forecast semanal: load, detail, employees list, delete
-- ---------------------------------------------------------------------------
create or replace function public.load_forecast_weeks(
  p_employees   jsonb,
  p_engagements jsonb,
  p_rows        jsonb
)
returns integer language plpgsql security definer
set search_path = te, public
as $$
declare v_count integer;
begin
  insert into dim_employee (employee_gui, employee_name)
  select e->>'employee_gui', e->>'employee_name'
  from jsonb_array_elements(p_employees) e
  on conflict (employee_gui) do update
    set employee_name = coalesce(nullif(excluded.employee_name, ''), dim_employee.employee_name);

  insert into dim_engagement (engagement_id, engagement_name, project_id)
  select e->>'engagement_id', e->>'engagement_name', '_FORECAST_'
  from jsonb_array_elements(p_engagements) e
  on conflict (engagement_id) do update
    set engagement_name = coalesce(nullif(excluded.engagement_name, ''), dim_engagement.engagement_name);

  with ins as (
    insert into fact_forecast_week (employee_gui, engagement_id, week_start_date, effective_hours, billable_hours)
    select r->>'employee_gui', r->>'engagement_id', (r->>'week_start_date')::date,
           nullif(r->>'effective_hours', '')::float8, nullif(r->>'billable_hours', '')::float8
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

create or replace function public.get_employee_forecast_detail(
  p_employee_guis text[],
  p_fiscal_year   integer default null
)
returns table (
  employee_gui text, employee_name text, engagement_id text, engagement_name text,
  week_key text, effective_hours float8, billable_hours float8
)
language sql security definer stable
set search_path = te, public
as $$
  select fw.employee_gui, em.employee_name, fw.engagement_id, eng.engagement_name,
         fw.week_start_date::text, fw.effective_hours::float8, fw.billable_hours::float8
  from fact_forecast_week fw
  left join dim_employee   em  on em.employee_gui   = fw.employee_gui
  left join dim_engagement eng on eng.engagement_id = fw.engagement_id
  where fw.employee_gui = any(p_employee_guis)
    and (p_fiscal_year is null or te.fiscal_year(fw.week_start_date) = p_fiscal_year)
  order by coalesce(em.employee_name, fw.employee_gui), fw.employee_gui,
           coalesce(eng.engagement_name, fw.engagement_id), fw.engagement_id, fw.week_start_date;
$$;
grant execute on function public.get_employee_forecast_detail(text[], integer) to authenticated;

create or replace function public.get_employees_with_forecast()
returns table (employee_gui text, employee_name text)
language sql security definer stable
set search_path = te, public
as $$
  select distinct fw.employee_gui, em.employee_name
  from fact_forecast_week fw
  left join dim_employee em on em.employee_gui = fw.employee_gui
  order by em.employee_name nulls last, fw.employee_gui;
$$;
grant execute on function public.get_employees_with_forecast() to authenticated;

create or replace function public.delete_forecast_data()
returns void language sql security definer
set search_path = te, public
as $$ truncate te.fact_forecast_week restart identity; $$;
revoke execute on function public.delete_forecast_data() from public, anon;
grant  execute on function public.delete_forecast_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Carga masiva de tiempo y gastos
-- ---------------------------------------------------------------------------
create or replace function public.load_time_expense(
  p_clients         jsonb default '[]', p_opportunities   jsonb default '[]',
  p_projects        jsonb default '[]', p_engagements     jsonb default '[]',
  p_ranks           jsonb default '[]', p_grades          jsonb default '[]',
  p_employees       jsonb default '[]', p_vendors         jsonb default '[]',
  p_accounts        jsonb default '[]', p_activities      jsonb default '[]',
  p_categories      jsonb default '[]', p_ttypes          jsonb default '[]',
  p_time_rows       jsonb default '[]', p_expense_rows    jsonb default '[]'
)
returns jsonb language plpgsql security definer
set search_path = te, public
as $$
declare
  v_time_inserted    integer := 0;
  v_expense_inserted integer := 0;
begin
  insert into dim_client (client_id, client_name)
  select e->>'client_id', nullif(e->>'client_name', '')
  from jsonb_array_elements(p_clients) e
  on conflict (client_id) do update set client_name = excluded.client_name;

  insert into dim_opportunity (opportunity_id, opportunity_name, client_id)
  select e->>'opportunity_id', nullif(e->>'opportunity_name', ''), e->>'client_id'
  from jsonb_array_elements(p_opportunities) e
  on conflict (opportunity_id) do update set opportunity_name = excluded.opportunity_name, client_id = excluded.client_id;

  insert into dim_project (project_id, project_name, opportunity_id)
  select e->>'project_id', nullif(e->>'project_name', ''), e->>'opportunity_id'
  from jsonb_array_elements(p_projects) e
  on conflict (project_id) do update set project_name = excluded.project_name, opportunity_id = excluded.opportunity_id;

  insert into dim_engagement (engagement_id, engagement_name, project_id, service_line, country_region)
  select e->>'engagement_id', nullif(e->>'engagement_name', ''), e->>'project_id',
         nullif(e->>'service_line', ''), nullif(e->>'country_region', '')
  from jsonb_array_elements(p_engagements) e
  on conflict (engagement_id) do update set
    engagement_name = excluded.engagement_name, project_id = excluded.project_id,
    service_line    = excluded.service_line,    country_region = excluded.country_region;

  insert into dim_rank (rank_code)
  select nullif(e->>'rank_code', '') from jsonb_array_elements(p_ranks) e
  where nullif(e->>'rank_code', '') is not null on conflict do nothing;

  insert into dim_grade (grade)
  select nullif(e->>'grade', '') from jsonb_array_elements(p_grades) e
  where nullif(e->>'grade', '') is not null on conflict do nothing;

  insert into dim_employee (employee_gui, employee_name, gds, cost_center, employee_region, business_unit, rank_code, grade)
  select e->>'employee_gui', nullif(e->>'employee_name',''), nullif(e->>'gds',''),
         nullif(e->>'cost_center',''), nullif(e->>'employee_region',''), nullif(e->>'business_unit',''),
         nullif(e->>'rank_code',''), nullif(e->>'grade','')
  from jsonb_array_elements(p_employees) e
  on conflict (employee_gui) do update set
    employee_name=excluded.employee_name, gds=excluded.gds, cost_center=excluded.cost_center,
    employee_region=excluded.employee_region, business_unit=excluded.business_unit,
    rank_code=excluded.rank_code, grade=excluded.grade;

  insert into dim_vendor (vendor_id, vendor_name)
  select e->>'vendor_id', nullif(e->>'vendor_name','') from jsonb_array_elements(p_vendors) e
  on conflict (vendor_id) do update set vendor_name = excluded.vendor_name;

  insert into dim_account (account_id, account_name)
  select e->>'account_id', nullif(e->>'account_name','') from jsonb_array_elements(p_accounts) e
  on conflict (account_id) do update set account_name = excluded.account_name;

  insert into dim_activity (activity_code, activity_description)
  select e->>'activity_code', nullif(e->>'activity_description','') from jsonb_array_elements(p_activities) e
  on conflict (activity_code) do update set activity_description = excluded.activity_description;

  insert into dim_category (category_code, category_description, sub_category_description)
  select e->>'category_code', nullif(e->>'category_description',''), nullif(e->>'sub_category_description','')
  from jsonb_array_elements(p_categories) e
  on conflict (category_code) do update set
    category_description=excluded.category_description,
    sub_category_description=excluded.sub_category_description;

  insert into dim_transaction_type (transaction_type_code)
  select nullif(e->>'transaction_type_code','') from jsonb_array_elements(p_ttypes) e
  where nullif(e->>'transaction_type_code','') is not null on conflict do nothing;

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
    select e->>'engagement_id', e->>'employee_gui',
      nullif(e->>'rank_code',''), nullif(e->>'grade',''),
      nullif(e->>'transaction_date','')::date, nullif(e->>'accounting_date','')::date,
      nullif(e->>'week_ending_date','')::date,
      nullif(e->>'charged_hours','')::numeric,           nullif(e->>'nsr_revenue','')::numeric,
      nullif(e->>'eaf_reserve_allocation','')::numeric,  nullif(e->>'ansr_revenue','')::numeric,
      nullif(e->>'labor_cost','')::numeric,              nullif(e->>'labor_cost_rate','')::numeric,
      nullif(e->>'tech_uplift_cost','')::numeric,        nullif(e->>'tech_product_cost','')::numeric,
      nullif(e->>'tech_product_cost_rate','')::numeric,  nullif(e->>'margin_cost','')::numeric,
      nullif(e->>'margin_cost_rate','')::numeric,        nullif(e->>'rate_card_rate','')::numeric,
      nullif(e->>'rate_card_amount','')::numeric,
      nullif(e->>'activity_code',''),
      coalesce(nullif(e->>'transaction_type_code',''), 'Labor'),
      coalesce((e->>'relieved_flag')::boolean, false)
    from jsonb_array_elements(p_time_rows) e
    on conflict on constraint uq_time_charge do nothing
    returning id
  )
  select count(*) into v_time_inserted from ins;

  with ins as (
    insert into fact_expense (
      engagement_id, vendor_id, account_id, transaction_type_code,
      employee_gui, transaction_date, accounting_date, week_ending_date,
      expense_amount, expense_description, origin, destination,
      trip_id, journal_id, voucher_id, activity_code, category_code
    )
    select e->>'engagement_id', nullif(e->>'vendor_id',''), nullif(e->>'account_id',''),
      e->>'transaction_type_code', nullif(e->>'employee_gui',''),
      nullif(e->>'transaction_date','')::date, nullif(e->>'accounting_date','')::date,
      nullif(e->>'week_ending_date','')::date,
      (e->>'expense_amount')::numeric, nullif(e->>'expense_description',''),
      nullif(e->>'origin',''), nullif(e->>'destination',''), nullif(e->>'trip_id',''),
      nullif(e->>'journal_id',''), nullif(e->>'voucher_id',''),
      nullif(e->>'activity_code',''), nullif(e->>'category_code','')
    from jsonb_array_elements(p_expense_rows) e
    on conflict do nothing returning id
  )
  select count(*) into v_expense_inserted from ins;

  return jsonb_build_object('time_inserted', v_time_inserted, 'expense_inserted', v_expense_inserted);
end;
$$;
grant execute on function public.load_time_expense(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Upsert forzado de imputaciones (sobrescribe duplicados)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_time_charges(p_rows jsonb)
returns integer language plpgsql security definer
set search_path = te, public
as $$
declare v_count integer;
begin
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
    select e->>'engagement_id', e->>'employee_gui',
      nullif(e->>'rank_code',''), nullif(e->>'grade',''),
      nullif(e->>'transaction_date','')::date, nullif(e->>'accounting_date','')::date,
      nullif(e->>'week_ending_date','')::date,
      nullif(e->>'charged_hours','')::numeric,           nullif(e->>'nsr_revenue','')::numeric,
      nullif(e->>'eaf_reserve_allocation','')::numeric,  nullif(e->>'ansr_revenue','')::numeric,
      nullif(e->>'labor_cost','')::numeric,              nullif(e->>'labor_cost_rate','')::numeric,
      nullif(e->>'tech_uplift_cost','')::numeric,        nullif(e->>'tech_product_cost','')::numeric,
      nullif(e->>'tech_product_cost_rate','')::numeric,  nullif(e->>'margin_cost','')::numeric,
      nullif(e->>'margin_cost_rate','')::numeric,        nullif(e->>'rate_card_rate','')::numeric,
      nullif(e->>'rate_card_amount','')::numeric,
      nullif(e->>'activity_code',''),
      coalesce(nullif(e->>'transaction_type_code',''), 'Labor'),
      coalesce((e->>'relieved_flag')::boolean, false)
    from jsonb_array_elements(p_rows) e
    on conflict on constraint uq_time_charge do update set
      rank_code=excluded.rank_code, grade=excluded.grade,
      accounting_date=excluded.accounting_date, week_ending_date=excluded.week_ending_date,
      charged_hours=excluded.charged_hours, nsr_revenue=excluded.nsr_revenue,
      eaf_reserve_allocation=excluded.eaf_reserve_allocation, ansr_revenue=excluded.ansr_revenue,
      labor_cost=excluded.labor_cost, labor_cost_rate=excluded.labor_cost_rate,
      tech_uplift_cost=excluded.tech_uplift_cost, tech_product_cost=excluded.tech_product_cost,
      tech_product_cost_rate=excluded.tech_product_cost_rate, margin_cost=excluded.margin_cost,
      margin_cost_rate=excluded.margin_cost_rate, rate_card_rate=excluded.rate_card_rate,
      rate_card_amount=excluded.rate_card_amount, transaction_type_code=excluded.transaction_type_code,
      relieved_flag=excluded.relieved_flag, loaded_at=now()
    returning id
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;
grant execute on function public.upsert_time_charges(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Presupuesto y estado de engagement
-- ---------------------------------------------------------------------------
create or replace function public.set_engagement_budget(p_engagement_id text, p_budget numeric)
returns void language sql security definer
set search_path = te, public
as $$
  insert into engagement_budget (engagement_id, budget, updated_at)
  values (p_engagement_id, p_budget, now())
  on conflict (engagement_id) do update set budget = excluded.budget, updated_at = excluded.updated_at;
$$;
grant execute on function public.set_engagement_budget(text, numeric) to authenticated;

create or replace function public.set_engagement_status(p_engagement_id text, p_status text)
returns void language sql security definer
set search_path = te, public
as $$
  insert into engagement_budget (engagement_id, budget, status, updated_at)
  values (p_engagement_id, 0, p_status, now())
  on conflict (engagement_id) do update set status = excluded.status, updated_at = excluded.updated_at;
$$;
grant execute on function public.set_engagement_status(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de administración
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_clients()
returns table (client_id text, client_name text, color text, business_unit text)
language sql security definer stable set search_path = te, public
as $$ select client_id, client_name, color, coalesce(business_unit, 'Studio+') from dim_client order by client_name; $$;
grant execute on function public.admin_list_clients() to authenticated;

create or replace function public.admin_set_client_color(p_client_id text, p_color text)
returns void language sql security definer set search_path = te, public
as $$ update dim_client set color = p_color where client_id = p_client_id; $$;
grant execute on function public.admin_set_client_color(text, text) to authenticated;

create or replace function public.admin_set_client_business_unit(p_client_id text, p_business_unit text)
returns void language sql security definer set search_path = te, public
as $$ update dim_client set business_unit = p_business_unit where client_id = p_client_id; $$;
grant execute on function public.admin_set_client_business_unit(text, text) to authenticated;

create or replace function public.admin_list_vendors()
returns table (vendor_id text, vendor_name text, color text)
language sql security definer stable set search_path = te, public
as $$ select vendor_id, vendor_name, color from dim_vendor order by vendor_name; $$;
grant execute on function public.admin_list_vendors() to authenticated;

create or replace function public.admin_set_vendor_color(p_vendor_id text, p_color text)
returns void language sql security definer set search_path = te, public
as $$ update dim_vendor set color = p_color where vendor_id = p_vendor_id; $$;
grant execute on function public.admin_set_vendor_color(text, text) to authenticated;

create or replace function public.admin_list_engagements()
returns table (engagement_id text, engagement_name text, client_name text, budget numeric, status text)
language sql security definer stable set search_path = te, public
as $$
  select e.engagement_id, e.engagement_name, c.client_name, eb.budget,
         coalesce(eb.status, 'activo')
  from dim_engagement e
  join dim_project     p  on p.project_id     = e.project_id
  join dim_opportunity o  on o.opportunity_id = p.opportunity_id
  join dim_client      c  on c.client_id      = o.client_id
  left join engagement_budget eb on eb.engagement_id = e.engagement_id
  order by c.client_name, e.engagement_name;
$$;
grant execute on function public.admin_list_engagements() to authenticated;

create or replace function public.admin_set_engagement(p_engagement_id text, p_budget numeric, p_status text)
returns void language sql security definer set search_path = te, public
as $$
  insert into engagement_budget (engagement_id, budget, status, updated_at)
  values (p_engagement_id, p_budget, p_status, now())
  on conflict (engagement_id) do update set
    budget=excluded.budget, status=excluded.status, updated_at=excluded.updated_at;
$$;
grant execute on function public.admin_set_engagement(text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Borrado de datos de un cliente (sin tocar dimensiones compartidas)
-- ---------------------------------------------------------------------------
create or replace function public.delete_client_data(p_client_id text)
returns void language plpgsql security definer
set search_path = te, public
as $$
begin
  delete from fact_time_charge where engagement_id in (
    select e.engagement_id from dim_engagement e
    join dim_project p on p.project_id = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    where o.client_id = p_client_id);
  delete from fact_expense where engagement_id in (
    select e.engagement_id from dim_engagement e
    join dim_project p on p.project_id = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    where o.client_id = p_client_id);
  delete from engagement_budget where engagement_id in (
    select e.engagement_id from dim_engagement e
    join dim_project p on p.project_id = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    where o.client_id = p_client_id);
  delete from dim_engagement where project_id in (
    select p.project_id from dim_project p
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    where o.client_id = p_client_id);
  delete from dim_project where opportunity_id in (
    select opportunity_id from dim_opportunity where client_id = p_client_id);
  delete from dim_opportunity where client_id = p_client_id;
  delete from dim_client     where client_id  = p_client_id;
end;
$$;
revoke execute on function public.delete_client_data(text) from public, anon;
grant  execute on function public.delete_client_data(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Vaciado total de datos (preserva engagement_budget y semillas)
-- ---------------------------------------------------------------------------
create or replace function public.truncate_all_data()
returns void language plpgsql security definer
set search_path = te, public
as $$
begin
  truncate table
    fact_time_charge, fact_expense,
    dim_employee, dim_vendor, dim_account, dim_activity, dim_category,
    dim_engagement, dim_project, dim_opportunity, dim_client,
    dim_transaction_type, dim_rank, dim_grade
  restart identity cascade;

  insert into dim_transaction_type (transaction_type_code) values
    ('Labor'), ('AP (FB60 Solution) Expense'), ('Travel Expense') on conflict do nothing;
  insert into dim_rank (rank_code) values
    ('Staff/Assistant'),('Senior'),('Manager'),('Senior Manager'),('Partner/Principal') on conflict do nothing;
  insert into dim_grade (grade) values ('1'),('2'),('3') on conflict do nothing;
end;
$$;
revoke execute on function public.truncate_all_data() from public, anon, authenticated;
grant  execute on function public.truncate_all_data() to service_role;

-- =============================================================================
-- FIN DEL ESQUEMA
-- =============================================================================
