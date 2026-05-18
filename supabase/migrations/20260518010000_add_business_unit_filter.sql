-- =============================================================================
-- Add p_business_unit filter to all global RPCs
-- =============================================================================

-- Helper macro: returns set of engagement_ids for a given business_unit
-- (null = all)
-- Used as a subquery filter in RPCs that don't already join dim_client.

-- ── 1. get_engagement_kpis ───────────────────────────────────────────────────
-- Latest version is a no-parameter function; we need to drop & recreate with
-- p_fiscal_year + p_active_only + p_business_unit.
-- We look at what migrations 20260507xxx and 20260511xxx have built.

drop function if exists public.get_engagement_kpis(integer, boolean, text);
drop function if exists public.get_engagement_kpis(integer, boolean);
drop function if exists public.get_engagement_kpis(integer);
drop function if exists public.get_engagement_kpis();

create function public.get_engagement_kpis(
  p_fiscal_year   integer default null,
  p_active_only   boolean default false,
  p_business_unit text    default null
)
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
  budget           float8,
  status           text
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      engagement_id,
      sum(charged_hours) as horas,
      sum(nsr_revenue)   as nsr,
      sum(ansr_revenue)  as ansr,
      sum(margin_cost)   as coste_margen
    from fact_time_charge
    where (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  ),
  ex as (
    select
      engagement_id,
      sum(expense_amount) as gasto_total
    from fact_expense
    where (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by engagement_id
  )
  select
    c.client_name,
    p.project_name,
    e.engagement_id,
    e.engagement_name,
    coalesce(tc.horas,        0)::float8 as horas,
    coalesce(tc.nsr,          0)::float8 as nsr,
    coalesce(tc.ansr,         0)::float8 as ansr,
    coalesce(tc.coste_margen, 0)::float8 as coste_margen,
    (coalesce(tc.ansr, 0) - coalesce(tc.coste_margen, 0))::float8 as margen_bruto,
    coalesce(ex.gasto_total,  0)::float8 as gasto_total,
    (coalesce(tc.ansr, 0) + coalesce(ex.gasto_total, 0))::float8  as ter,
    b.budget::float8                                               as budget,
    coalesce(b.status, 'activo')                                   as status
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


-- ── 2. get_global_monthly_ter_by_client ────────────────────────────────────
drop function if exists public.get_global_monthly_ter_by_client(integer, text);
drop function if exists public.get_global_monthly_ter_by_client(integer);

create function public.get_global_monthly_ter_by_client(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  mes          text,
  client_id    text,
  client_name  text,
  color        text,
  ter          float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      engagement_id,
      sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  ex as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      engagement_id,
      sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  all_eng_months as (
    select mes, engagement_id from tc
    union
    select mes, engagement_id from ex
  )
  select
    aem.mes,
    c.client_id,
    c.client_name,
    c.color,
    (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0))::float8 as ter
  from all_eng_months aem
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


-- ── 3. get_global_quarterly_ter_by_client ──────────────────────────────────
drop function if exists public.get_global_quarterly_ter_by_client(integer, text);
drop function if exists public.get_global_quarterly_ter_by_client(integer);

create function public.get_global_quarterly_ter_by_client(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  quarter      text,
  quarter_sort text,
  client_id    text,
  client_name  text,
  color        text,
  ansr         float8,
  gastos       float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with tc as (
    select
      date_trunc('quarter', coalesce(accounting_date, transaction_date)) as qstart,
      engagement_id,
      sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  ex as (
    select
      date_trunc('quarter', coalesce(accounting_date, transaction_date)) as qstart,
      engagement_id,
      sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
    group by 1, 2
  ),
  all_pairs as (
    select qstart, engagement_id from tc
    union
    select qstart, engagement_id from ex
  )
  select
    'Q' || extract(quarter from ap.qstart)::int
      || ' ' || extract(year from ap.qstart)::int           as quarter,
    to_char(ap.qstart, 'YYYY') || '-Q'
      || extract(quarter from ap.qstart)::int::text         as quarter_sort,
    c.client_id,
    c.client_name,
    c.color,
    coalesce(sum(tc.ansr),   0)::float8                     as ansr,
    coalesce(sum(ex.gastos), 0)::float8                     as gastos
  from all_pairs ap
  join dim_engagement  e on e.engagement_id  = ap.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  left join tc on tc.qstart = ap.qstart and tc.engagement_id = ap.engagement_id
  left join ex on ex.qstart = ap.qstart and ex.engagement_id = ap.engagement_id
  where (p_business_unit is null or c.business_unit = p_business_unit)
  group by ap.qstart, c.client_id, c.client_name, c.color
  having (coalesce(sum(tc.ansr), 0) + coalesce(sum(ex.gastos), 0)) <> 0
  order by quarter_sort, c.client_name;
$$;

grant execute on function public.get_global_quarterly_ter_by_client(integer, text) to authenticated;


-- ── 4. get_global_monthly_ter_breakdown ────────────────────────────────────
drop function if exists public.get_global_monthly_ter_breakdown(integer, text);
drop function if exists public.get_global_monthly_ter_breakdown(integer);

create function public.get_global_monthly_ter_breakdown(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  mes    text,
  ansr   float8,
  gastos float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with bu_eng as (
    -- engagement_ids filtered by business_unit (null = all)
    select e.engagement_id
    from dim_engagement  e
    join dim_project     p on p.project_id     = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    join dim_client      c on c.client_id      = o.client_id
    where (p_business_unit is null or c.business_unit = p_business_unit)
  ),
  tc as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(ansr_revenue) as ansr
    from fact_time_charge
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
      and (p_business_unit is null or engagement_id in (select engagement_id from bu_eng))
    group by 1
  ),
  ex as (
    select
      to_char(coalesce(accounting_date, transaction_date), 'YYYY-MM') as mes,
      sum(expense_amount) as gastos
    from fact_expense
    where coalesce(accounting_date, transaction_date) is not null
      and (p_fiscal_year is null
           or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year)
      and (p_business_unit is null or engagement_id in (select engagement_id from bu_eng))
    group by 1
  ),
  months as (
    select mes from tc
    union
    select mes from ex
  )
  select
    m.mes,
    coalesce(tc.ansr,   0)::float8 as ansr,
    coalesce(ex.gastos, 0)::float8 as gastos
  from months m
  left join tc on tc.mes = m.mes
  left join ex on ex.mes = m.mes
  order by 1;
$$;

grant execute on function public.get_global_monthly_ter_breakdown(integer, text) to authenticated;


-- ── 5. get_global_monthly_expenses_by_vendor ───────────────────────────────
drop function if exists public.get_global_monthly_expenses_by_vendor(integer, text);
drop function if exists public.get_global_monthly_expenses_by_vendor(integer);

create function public.get_global_monthly_expenses_by_vendor(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  mes          text,
  vendor_id    text,
  vendor_name  text,
  color        text,
  gasto_total  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  with bu_eng as (
    select e.engagement_id
    from dim_engagement  e
    join dim_project     p on p.project_id     = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    join dim_client      c on c.client_id      = o.client_id
    where (p_business_unit is null or c.business_unit = p_business_unit)
  )
  select
    to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as mes,
    coalesce(x.vendor_id, '—')                                           as vendor_id,
    coalesce(v.vendor_name, '(sin vendor)')                              as vendor_name,
    v.color,
    sum(x.expense_amount)::float8                                        as gasto_total
  from fact_expense x
  left join dim_vendor v on v.vendor_id = x.vendor_id
  where coalesce(x.accounting_date, x.transaction_date) is not null
    and (p_fiscal_year is null
         or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year)
    and (p_business_unit is null or x.engagement_id in (select engagement_id from bu_eng))
  group by 1, 2, 3, 4
  order by 1, 5 desc;
$$;

grant execute on function public.get_global_monthly_expenses_by_vendor(integer, text) to authenticated;


-- ── 6. get_global_monthly_ter_with_forecast ────────────────────────────────
-- (plpgsql — needs DROP + full recreate because signature changes)
drop function if exists public.get_global_monthly_ter_with_forecast(integer, text);
drop function if exists public.get_global_monthly_ter_with_forecast(integer);

create function public.get_global_monthly_ter_with_forecast(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  mes           text,
  ansr_real     float8,
  ansr_fc       float8,
  gastos_real   float8,
  gastos_fc     float8,
  is_partial    boolean,
  is_forecast   boolean
)
language plpgsql
security definer
stable
set search_path = te, public
as $$
declare
  v_last_real_date    date;
  v_last_real_mes     text;
  v_rate_ref_mes      text;
  v_fy                int;
  v_fy_start          date;
  v_fy_end            date;
  v_partial_workdays  int := 0;
  v_is_partial        boolean;
begin
  v_fy       := coalesce(p_fiscal_year, te.fiscal_year(current_date));
  v_fy_start := make_date(v_fy - 1, 7, 1);
  v_fy_end   := make_date(v_fy,     6, 30);

  select max(coalesce(tc.accounting_date, tc.transaction_date))
    into v_last_real_date
  from fact_time_charge tc
  join dim_engagement  e on e.engagement_id  = tc.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
    and (p_business_unit is null or c.business_unit = p_business_unit);

  if v_last_real_date is null then return; end if;

  v_last_real_mes := to_char(v_last_real_date, 'YYYY-MM');

  v_is_partial := v_last_real_date <
    (date_trunc('month', v_last_real_date) + interval '1 month' - interval '1 day')::date;

  v_rate_ref_mes := to_char(
    date_trunc('month', to_date(v_last_real_mes, 'YYYY-MM')) - interval '1 day',
    'YYYY-MM'
  );

  if v_is_partial then
    select count(*) into v_partial_workdays
    from generate_series(
      v_last_real_date + interval '1 day',
      (date_trunc('month', v_last_real_date) + interval '1 month' - interval '1 day')::date,
      interval '1 day'
    ) as wd
    where extract(dow from wd) between 1 and 5
      and not (extract(month from wd) = 1  and extract(day from wd) = 1)
      and not (extract(month from wd) = 1  and extract(day from wd) = 6)
      and not (extract(month from wd) = 5  and extract(day from wd) = 1)
      and not (extract(month from wd) = 8  and extract(day from wd) = 15)
      and not (extract(month from wd) = 10 and extract(day from wd) = 12)
      and not (extract(month from wd) = 11 and extract(day from wd) = 1)
      and not (extract(month from wd) = 12 and extract(day from wd) = 6)
      and not (extract(month from wd) = 12 and extract(day from wd) = 8)
      and not (extract(month from wd) = 12 and extract(day from wd) = 25);
  end if;

  return query
  with
  bu_eng as (
    select e.engagement_id
    from dim_engagement  e
    join dim_project     p on p.project_id     = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    join dim_client      c on c.client_id      = o.client_id
    where (p_business_unit is null or c.business_unit = p_business_unit)
  ),
  real_ansr as (
    select to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') as ra_mes,
           sum(tc.ansr_revenue)::float8 as ra_ansr
    from fact_time_charge tc
    where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
      and (p_business_unit is null or tc.engagement_id in (select engagement_id from bu_eng))
    group by 1
  ),
  real_gastos as (
    select to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as rg_mes,
           sum(x.expense_amount)::float8 as rg_gastos
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
      and (p_business_unit is null or x.engagement_id in (select engagement_id from bu_eng))
    group by 1
  ),
  real_months as (
    select ra_mes as rm_mes from real_ansr
    union
    select rg_mes from real_gastos
  ),
  emp_ranked as (
    select tc.employee_gui,
           to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') as er_mes,
           sum(tc.charged_hours) as er_horas,
           sum(tc.ansr_revenue)  as er_ansr,
           row_number() over (
             partition by tc.employee_gui
             order by to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') desc
           ) as rn
    from fact_time_charge tc
    where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
      and to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') <= v_rate_ref_mes
      and tc.charged_hours > 0
      and (p_business_unit is null or tc.engagement_id in (select engagement_id from bu_eng))
    group by 1, 2
  ),
  emp_last3 as (
    select employee_gui,
           sum(er_horas) as total_hours,
           sum(er_ansr)  as total_ansr,
           count(*)      as n_months
    from emp_ranked
    where rn <= 3
    group by 1
    having sum(er_horas) > 0
  ),
  emp_avg as (
    select employee_gui,
           total_ansr / nullif(total_hours, 0) as ansr_per_hour,
           total_hours / n_months              as avg_monthly_hours
    from emp_last3
  ),
  vendor_ranked as (
    select x.vendor_id,
           to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as vr_mes,
           sum(x.expense_amount) as vr_gasto,
           row_number() over (
             partition by x.vendor_id
             order by to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') desc
           ) as rn
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
      and to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') <= v_rate_ref_mes
      and (p_business_unit is null or x.engagement_id in (select engagement_id from bu_eng))
    group by 1, 2
  ),
  vendor_avg as (
    select vendor_id,
           sum(vr_gasto)::float8 / count(*) as avg_monthly_gastos
    from vendor_ranked
    where rn <= 3
    group by 1
  ),
  global_emp as (
    select coalesce(sum(ea.ansr_per_hour * ea.avg_monthly_hours), 0) as base_ansr
    from emp_avg ea
  ),
  global_vendor as (
    select coalesce(sum(va.avg_monthly_gastos), 0) as base_gastos
    from vendor_avg va
  ),
  future_series as (
    select to_char(gs_date, 'YYYY-MM') as fs_mes,
           gs_date::date               as fs_start
    from generate_series(
      date_trunc('month', to_date(v_last_real_mes, 'YYYY-MM') + interval '1 month')::date,
      date_trunc('month', v_fy_end)::date,
      interval '1 month'
    ) as gs_date
  ),
  future_workdays as (
    select fs.fs_mes, count(*) as workdays
    from future_series fs
    cross join lateral (
      select day_d
      from generate_series(
        fs.fs_start,
        (fs.fs_start + interval '1 month' - interval '1 day')::date,
        interval '1 day'
      ) as day_d
      where extract(dow from day_d) between 1 and 5
        and not (extract(month from day_d) = 1  and extract(day from day_d) = 1)
        and not (extract(month from day_d) = 1  and extract(day from day_d) = 6)
        and not (extract(month from day_d) = 5  and extract(day from day_d) = 1)
        and not (extract(month from day_d) = 8  and extract(day from day_d) = 15)
        and not (extract(month from day_d) = 10 and extract(day from day_d) = 12)
        and not (extract(month from day_d) = 11 and extract(day from day_d) = 1)
        and not (extract(month from day_d) = 12 and extract(day from day_d) = 6)
        and not (extract(month from day_d) = 12 and extract(day from day_d) = 8)
        and not (extract(month from day_d) = 12 and extract(day from day_d) = 25)
    ) days
    group by fs.fs_mes
  ),
  forecast_future as (
    select fw.fs_mes                                                as fc_mes,
           (ge.base_ansr   * fw.workdays::float8 / 23.0)::float8   as fc_ansr,
           (gv.base_gastos * fw.workdays::float8 / 23.0)::float8   as fc_gastos
    from future_workdays fw
    cross join global_emp ge
    cross join global_vendor gv
  )
  select rm.rm_mes,
         coalesce(ra.ra_ansr,   0)::float8, 0::float8,
         coalesce(rg.rg_gastos, 0)::float8, 0::float8,
         false, false
  from real_months rm
  left join real_ansr   ra on ra.ra_mes = rm.rm_mes
  left join real_gastos rg on rg.rg_mes = rm.rm_mes
  where rm.rm_mes <> v_last_real_mes

  union all

  select v_last_real_mes,
         coalesce((select ra_ansr from real_ansr where ra_mes = v_last_real_mes), 0)::float8,
         case when v_is_partial
              then ((select base_ansr from global_emp) * v_partial_workdays::float8 / 23.0)
              else 0 end::float8,
         coalesce((select rg_gastos from real_gastos where rg_mes = v_last_real_mes), 0)::float8,
         case when v_is_partial
              then ((select base_gastos from global_vendor) * v_partial_workdays::float8 / 23.0)
              else 0 end::float8,
         v_is_partial, false

  union all

  select fc.fc_mes, 0::float8, fc.fc_ansr, 0::float8, fc.fc_gastos, false, true
  from forecast_future fc

  order by 1;
end;
$$;

grant execute on function public.get_global_monthly_ter_with_forecast(integer, text) to authenticated;


-- ── 7. get_global_fy_forecast_totals ───────────────────────────────────────
drop function if exists public.get_global_fy_forecast_totals(integer, text);
drop function if exists public.get_global_fy_forecast_totals(integer);

create function public.get_global_fy_forecast_totals(
  p_fiscal_year   integer default null,
  p_business_unit text    default null
)
returns table (
  horas_real    float8,
  nsr_real      float8,
  ansr_real     float8,
  coste_real    float8,
  gastos_real   float8,
  horas_fc      float8,
  nsr_fc        float8,
  ansr_fc       float8,
  coste_fc      float8,
  gastos_fc     float8,
  n_engagements int,
  fy_end_mes    text
)
language plpgsql
security definer
stable
set search_path = te, public
as $$
declare
  v_last_real_date   date;
  v_last_real_mes    text;
  v_rate_ref_mes     text;
  v_fy               int;
  v_fy_start         date;
  v_fy_end           date;
  v_partial_workdays int := 0;
  v_is_partial       boolean;
begin
  v_fy       := coalesce(p_fiscal_year, te.fiscal_year(current_date));
  v_fy_start := make_date(v_fy - 1, 7, 1);
  v_fy_end   := make_date(v_fy,     6, 30);

  select max(coalesce(tc.accounting_date, tc.transaction_date))
    into v_last_real_date
  from fact_time_charge tc
  join dim_engagement  e on e.engagement_id  = tc.engagement_id
  join dim_project     p on p.project_id     = e.project_id
  join dim_opportunity o on o.opportunity_id = p.opportunity_id
  join dim_client      c on c.client_id      = o.client_id
  where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
    and (p_business_unit is null or c.business_unit = p_business_unit);

  if v_last_real_date is null then return; end if;

  v_last_real_mes := to_char(v_last_real_date, 'YYYY-MM');
  v_is_partial    := v_last_real_date <
    (date_trunc('month', v_last_real_date) + interval '1 month' - interval '1 day')::date;
  v_rate_ref_mes  := to_char(
    date_trunc('month', to_date(v_last_real_mes, 'YYYY-MM')) - interval '1 day',
    'YYYY-MM'
  );

  if v_is_partial then
    select count(*) into v_partial_workdays
    from generate_series(
      v_last_real_date + interval '1 day',
      (date_trunc('month', v_last_real_date) + interval '1 month' - interval '1 day')::date,
      interval '1 day'
    ) as wd
    where extract(dow from wd) between 1 and 5
      and not (extract(month from wd) = 1  and extract(day from wd) = 1)
      and not (extract(month from wd) = 1  and extract(day from wd) = 6)
      and not (extract(month from wd) = 5  and extract(day from wd) = 1)
      and not (extract(month from wd) = 8  and extract(day from wd) = 15)
      and not (extract(month from wd) = 10 and extract(day from wd) = 12)
      and not (extract(month from wd) = 11 and extract(day from wd) = 1)
      and not (extract(month from wd) = 12 and extract(day from wd) = 6)
      and not (extract(month from wd) = 12 and extract(day from wd) = 8)
      and not (extract(month from wd) = 12 and extract(day from wd) = 25);
  end if;

  return query
  with
  bu_eng as (
    select e.engagement_id
    from dim_engagement  e
    join dim_project     p on p.project_id     = e.project_id
    join dim_opportunity o on o.opportunity_id = p.opportunity_id
    join dim_client      c on c.client_id      = o.client_id
    where (p_business_unit is null or c.business_unit = p_business_unit)
  ),
  rt as (
    select
      coalesce(sum(tc.charged_hours), 0)::float8  as rt_horas,
      coalesce(sum(tc.nsr_revenue),   0)::float8  as rt_nsr,
      coalesce(sum(tc.ansr_revenue),  0)::float8  as rt_ansr,
      coalesce(sum(tc.margin_cost),   0)::float8  as rt_coste,
      count(distinct tc.engagement_id)::int       as rt_eng
    from fact_time_charge tc
    where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
      and (p_business_unit is null or tc.engagement_id in (select engagement_id from bu_eng))
  ),
  rg as (
    select coalesce(sum(x.expense_amount), 0)::float8 as rg_gastos
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
      and (p_business_unit is null or x.engagement_id in (select engagement_id from bu_eng))
  ),
  emp_ranked as (
    select tc.employee_gui,
           to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') as er_mes,
           sum(tc.charged_hours)::float8 as er_horas,
           sum(tc.nsr_revenue)::float8   as er_nsr,
           sum(tc.ansr_revenue)::float8  as er_ansr,
           sum(tc.margin_cost)::float8   as er_coste,
           row_number() over (
             partition by tc.employee_gui
             order by to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') desc
           ) as rn
    from fact_time_charge tc
    where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
      and to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') <= v_rate_ref_mes
      and tc.charged_hours > 0
      and (p_business_unit is null or tc.engagement_id in (select engagement_id from bu_eng))
    group by 1, 2
  ),
  emp_last3 as (
    select employee_gui,
           sum(er_horas)::float8 as total_horas,
           sum(er_nsr)::float8   as total_nsr,
           sum(er_ansr)::float8  as total_ansr,
           sum(er_coste)::float8 as total_coste,
           count(*)              as n_months
    from emp_ranked
    where rn <= 3
    group by 1
    having sum(er_horas) > 0
  ),
  emp_avg as (
    select
      (total_horas / n_months)::float8 as avg_horas,
      (total_nsr   / n_months)::float8 as avg_nsr,
      (total_ansr  / n_months)::float8 as avg_ansr,
      (total_coste / n_months)::float8 as avg_coste
    from emp_last3
  ),
  global_emp as (
    select
      coalesce(sum(avg_horas), 0)::float8 as base_horas,
      coalesce(sum(avg_nsr),   0)::float8 as base_nsr,
      coalesce(sum(avg_ansr),  0)::float8 as base_ansr,
      coalesce(sum(avg_coste), 0)::float8 as base_coste
    from emp_avg
  ),
  vendor_ranked as (
    select x.vendor_id,
           sum(x.expense_amount)::float8 as vr_gasto,
           row_number() over (
             partition by x.vendor_id
             order by to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') desc
           ) as rn
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
      and to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') <= v_rate_ref_mes
      and (p_business_unit is null or x.engagement_id in (select engagement_id from bu_eng))
    group by 1, to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM')
  ),
  global_vendor as (
    select coalesce(sum(vr_gasto / 3.0), 0)::float8 as base_gastos
    from (
      select vendor_id, sum(vr_gasto) as vr_gasto
      from vendor_ranked where rn <= 3
      group by 1
    ) v3
  ),
  future_series as (
    select to_char(gs_date, 'YYYY-MM') as fs_mes,
           gs_date::date               as fs_start
    from generate_series(
      date_trunc('month', to_date(v_last_real_mes, 'YYYY-MM') + interval '1 month')::date,
      date_trunc('month', v_fy_end)::date,
      interval '1 month'
    ) as gs_date
  ),
  future_workdays as (
    select sum(wd_count)::int as total_workdays
    from (
      select fs.fs_mes, count(*) as wd_count
      from future_series fs
      cross join lateral (
        select day_d
        from generate_series(
          fs.fs_start,
          (fs.fs_start + interval '1 month' - interval '1 day')::date,
          interval '1 day'
        ) as day_d
        where extract(dow from day_d) between 1 and 5
          and not (extract(month from day_d) = 1  and extract(day from day_d) = 1)
          and not (extract(month from day_d) = 1  and extract(day from day_d) = 6)
          and not (extract(month from day_d) = 5  and extract(day from day_d) = 1)
          and not (extract(month from day_d) = 8  and extract(day from day_d) = 15)
          and not (extract(month from day_d) = 10 and extract(day from day_d) = 12)
          and not (extract(month from day_d) = 11 and extract(day from day_d) = 1)
          and not (extract(month from day_d) = 12 and extract(day from day_d) = 6)
          and not (extract(month from day_d) = 12 and extract(day from day_d) = 8)
          and not (extract(month from day_d) = 12 and extract(day from day_d) = 25)
      ) days
      group by fs.fs_mes
    ) fw
  ),
  total_fc_days as (
    select (v_partial_workdays + coalesce(fw.total_workdays, 0))::float8 as days
    from future_workdays fw
  )
  select
    rt.rt_horas,
    rt.rt_nsr,
    rt.rt_ansr,
    rt.rt_coste,
    rg.rg_gastos,
    (ge.base_horas  * tcd.days / 23.0)::float8,
    (ge.base_nsr    * tcd.days / 23.0)::float8,
    (ge.base_ansr   * tcd.days / 23.0)::float8,
    (ge.base_coste  * tcd.days / 23.0)::float8,
    (gv.base_gastos * tcd.days / 23.0)::float8,
    rt.rt_eng,
    to_char(v_fy_end, 'YYYY-MM')
  from rt, rg, global_emp ge, global_vendor gv, total_fc_days tcd;
end;
$$;

grant execute on function public.get_global_fy_forecast_totals(integer, text) to authenticated;
