-- =============================================================================
-- Modelo de datos: Control de imputaciones (tiempo) y gastos por
-- cliente / proyecto / engagement / empleado.
--
-- Origen: libro "Detail" del export "Time and Expense Detail".
-- Esquema en estrella con dos tablas de hechos:
--   * fact_time_charge  -> imputaciones de horas (Transaction Type = Labor)
--   * fact_expense      -> gastos del proyecto    (AP / Travel Expense ...)
-- =============================================================================

create schema if not exists te;
set search_path = te, public;

-- -----------------------------------------------------------------------------
-- Dimensiones
-- -----------------------------------------------------------------------------

create table if not exists dim_client (
  client_id        text primary key,
  client_name      text not null
);

create table if not exists dim_opportunity (
  opportunity_id   text primary key,
  opportunity_name text,
  client_id        text not null references dim_client (client_id)
);

create table if not exists dim_project (
  project_id       text primary key,
  project_name     text,
  opportunity_id   text not null references dim_opportunity (opportunity_id)
);

create table if not exists dim_engagement (
  engagement_id    text primary key,
  engagement_name  text,
  project_id       text not null references dim_project (project_id),
  service_line     text,
  country_region   text,
  currency_code    text default 'EUR'
);

create table if not exists dim_rank (
  rank_code        text primary key
);

create table if not exists dim_grade (
  grade            text primary key
);

create table if not exists dim_employee (
  employee_gui     text primary key,
  employee_name    text,
  gds              text,
  cost_center      text,
  employee_region  text,
  business_unit    text,
  rank_code        text references dim_rank (rank_code),
  grade            text references dim_grade (grade)
);

create table if not exists dim_vendor (
  vendor_id        text primary key,
  vendor_name      text
);

create table if not exists dim_account (
  account_id       text primary key,
  account_name     text
);

create table if not exists dim_transaction_type (
  transaction_type_code text primary key
);

create table if not exists dim_activity (
  activity_code         text primary key,
  activity_description  text
);

create table if not exists dim_category (
  category_code             text primary key,
  category_description      text,
  sub_category_description  text
);

-- Semilla mínima
insert into dim_transaction_type (transaction_type_code) values
  ('Labor'),
  ('AP (FB60 Solution) Expense'),
  ('Travel Expense')
on conflict do nothing;

insert into dim_rank (rank_code) values
  ('Staff/Assistant'),
  ('Senior'),
  ('Manager'),
  ('Senior Manager'),
  ('Partner/Principal')
on conflict do nothing;

insert into dim_grade (grade) values ('1'), ('2'), ('3')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Hecho: imputaciones de tiempo
-- -----------------------------------------------------------------------------
create table if not exists fact_time_charge (
  id                      bigserial primary key,
  engagement_id           text not null references dim_engagement (engagement_id),
  employee_gui            text not null references dim_employee   (employee_gui),
  rank_code               text references dim_rank  (rank_code),
  grade                   text references dim_grade (grade),
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
  activity_code           text references dim_activity (activity_code),
  transaction_type_code   text references dim_transaction_type (transaction_type_code) default 'Labor',
  relieved_flag           boolean default false,
  currency_code           text default 'EUR',
  loaded_at               timestamptz default now(),
  constraint uq_time_charge unique (engagement_id, employee_gui, transaction_date, activity_code)
);

create index if not exists ix_tc_engagement_date on fact_time_charge (engagement_id, accounting_date);
create index if not exists ix_tc_employee        on fact_time_charge (employee_gui);
create index if not exists ix_tc_week            on fact_time_charge (week_ending_date);

-- -----------------------------------------------------------------------------
-- Hecho: gastos
-- -----------------------------------------------------------------------------
create table if not exists fact_expense (
  id                      bigserial primary key,
  engagement_id           text not null references dim_engagement (engagement_id),
  vendor_id               text references dim_vendor   (vendor_id),
  account_id              text references dim_account  (account_id),
  transaction_type_code   text not null references dim_transaction_type (transaction_type_code),
  employee_gui            text references dim_employee (employee_gui),
  transaction_date        date,
  accounting_date         date,
  week_ending_date        date,
  expense_amount          numeric(14,2) not null,
  expense_description     text,
  origin                  text,
  destination             text,
  trip_id                 text,
  journal_id              text,
  voucher_id              text,
  activity_code           text references dim_activity (activity_code),
  category_code           text references dim_category (category_code),
  currency_code           text default 'EUR',
  loaded_at               timestamptz default now()
);

-- Clave natural laxa: cuando hay voucher, debe ser único por engagement
create unique index if not exists uq_expense_voucher
  on fact_expense (engagement_id, voucher_id)
  where voucher_id is not null;

create index if not exists ix_ex_engagement_type on fact_expense (engagement_id, transaction_type_code);
create index if not exists ix_ex_vendor          on fact_expense (vendor_id);
create index if not exists ix_ex_accounting_date on fact_expense (accounting_date);

-- =============================================================================
-- Vistas analíticas
-- =============================================================================

create or replace view v_engagement_pl as
select e.engagement_id,
       e.engagement_name,
       coalesce(t.horas,        0)                        as horas,
       coalesce(t.nsr,          0)                        as nsr,
       coalesce(t.ansr,         0)                        as ansr,
       coalesce(t.coste_margen, 0)                        as coste_margen,
       coalesce(t.ansr, 0) - coalesce(t.coste_margen, 0) as margen_bruto,
       coalesce(x.gasto_total,  0)                        as gasto_total
from dim_engagement e
left join (
  select engagement_id,
         sum(charged_hours) as horas,
         sum(nsr_revenue)   as nsr,
         sum(ansr_revenue)  as ansr,
         sum(margin_cost)   as coste_margen
  from fact_time_charge
  group by engagement_id
) t using (engagement_id)
left join (
  select engagement_id,
         sum(expense_amount) as gasto_total
  from fact_expense
  group by engagement_id
) x using (engagement_id);

create or replace view v_charges_by_employee as
select tc.engagement_id,
       tc.employee_gui,
       em.employee_name,
       tc.rank_code,
       tc.grade,
       sum(tc.charged_hours) as horas,
       sum(tc.ansr_revenue)  as ansr,
       sum(tc.margin_cost)   as coste
from fact_time_charge tc
left join dim_employee em using (employee_gui)
group by tc.engagement_id, tc.employee_gui, em.employee_name, tc.rank_code, tc.grade;

create or replace view v_expense_by_vendor as
select x.engagement_id,
       x.transaction_type_code,
       x.vendor_id,
       v.vendor_name,
       sum(x.expense_amount) as total_gasto,
       count(*)              as n_lineas
from fact_expense x
left join dim_vendor v using (vendor_id)
group by x.engagement_id, x.transaction_type_code, x.vendor_id, v.vendor_name;

-- =============================================================================
-- Row Level Security (placeholder - habilitar política según tu app)
-- =============================================================================
alter table dim_client            enable row level security;
alter table dim_opportunity       enable row level security;
alter table dim_project           enable row level security;
alter table dim_engagement        enable row level security;
alter table dim_employee          enable row level security;
alter table dim_vendor            enable row level security;
alter table dim_account           enable row level security;
alter table fact_time_charge      enable row level security;
alter table fact_expense          enable row level security;

-- Política mínima: usuarios autenticados pueden leer todo.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'dim_client','dim_opportunity','dim_project','dim_engagement',
      'dim_employee','dim_vendor','dim_account',
      'fact_time_charge','fact_expense'
    ])
  loop
    execute format(
      'create policy %I on te.%I for select to authenticated using (true);',
      'read_'||t, t
    );
  end loop;
end$$;
