-- =============================================================================
-- TER mensual global con forecast para días/meses restantes del FY
-- Columnas: ansr_real, ansr_fc, gastos_real, gastos_fc, is_partial, is_forecast
-- is_partial = mes actual con datos parciales (se rellena con estimación)
-- is_forecast = mes completamente futuro
-- Tasas calculadas sobre los 3 meses COMPLETOS anteriores al mes parcial/actual
-- =============================================================================

drop function if exists public.get_global_monthly_ter_with_forecast(integer);

create function public.get_global_monthly_ter_with_forecast(
  p_fiscal_year integer default null
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
  v_rate_ref_mes      text;   -- last complete month for rate calc (< partial month)
  v_fy                int;
  v_fy_start          date;
  v_fy_end            date;
  v_partial_workdays  int := 0;
  v_is_partial        boolean;
begin
  v_fy       := coalesce(p_fiscal_year, te.fiscal_year(current_date));
  v_fy_start := make_date(v_fy - 1, 7, 1);
  v_fy_end   := make_date(v_fy,     6, 30);

  -- Last date and month with actual data
  select max(coalesce(tc.accounting_date, tc.transaction_date))
    into v_last_real_date
  from fact_time_charge tc
  where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end;

  if v_last_real_date is null then return; end if;

  v_last_real_mes := to_char(v_last_real_date, 'YYYY-MM');

  -- Is the last month partial? (data doesn't reach the end of that month)
  v_is_partial := v_last_real_date <
    (date_trunc('month', v_last_real_date) + interval '1 month' - interval '1 day')::date;

  -- Rate reference: last 3 complete months before v_last_real_mes
  v_rate_ref_mes := to_char(
    date_trunc('month', to_date(v_last_real_mes, 'YYYY-MM')) - interval '1 day',
    'YYYY-MM'
  );

  -- Remaining working days in the partial month (day after last data → end of month)
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
  -- ── Real data ────────────────────────────────────────────────────────────
  real_ansr as (
    select to_char(coalesce(tc.accounting_date, tc.transaction_date), 'YYYY-MM') as ra_mes,
           sum(tc.ansr_revenue)::float8 as ra_ansr
    from fact_time_charge tc
    where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
    group by 1
  ),
  real_gastos as (
    select to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as rg_mes,
           sum(x.expense_amount)::float8 as rg_gastos
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
    group by 1
  ),
  real_months as (
    select ra_mes as rm_mes from real_ansr
    union
    select rg_mes from real_gastos
  ),
  -- ── Employee rates from last 3 COMPLETE months ──────────────────────────
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
  -- ── Vendor rates from last 3 COMPLETE months ────────────────────────────
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
    group by 1, 2
  ),
  vendor_avg as (
    select vendor_id,
           sum(vr_gasto)::float8 / count(*) as avg_monthly_gastos
    from vendor_ranked
    where rn <= 3
    group by 1
  ),
  -- ── Global monthly base (sum over all active employees/vendors) ──────────
  global_emp as (
    select coalesce(sum(ea.ansr_per_hour * ea.avg_monthly_hours), 0) as base_ansr
    from emp_avg ea
  ),
  global_vendor as (
    select coalesce(sum(va.avg_monthly_gastos), 0) as base_gastos
    from vendor_avg va
  ),
  -- ── Future months (entirely forecast) ────────────────────────────────────
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
    select fs.fs_mes,
           count(*) as workdays
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
    select fw.fs_mes                                                               as fc_mes,
           (ge.base_ansr   * fw.workdays::float8 / 23.0)::float8                  as fc_ansr,
           (gv.base_gastos * fw.workdays::float8 / 23.0)::float8                  as fc_gastos
    from future_workdays fw
    cross join global_emp ge
    cross join global_vendor gv
  )
  -- ── Completed real months ─────────────────────────────────────────────────
  select rm.rm_mes,
         coalesce(ra.ra_ansr,   0)::float8 as ansr_real,
         0::float8                          as ansr_fc,
         coalesce(rg.rg_gastos, 0)::float8 as gastos_real,
         0::float8                          as gastos_fc,
         false                              as is_partial,
         false                              as is_forecast
  from real_months rm
  left join real_ansr   ra on ra.ra_mes = rm.rm_mes
  left join real_gastos rg on rg.rg_mes = rm.rm_mes
  where rm.rm_mes <> v_last_real_mes   -- exclude partial month (handled separately)

  union all

  -- ── Partial month (real data + forecast completion) ───────────────────────
  select v_last_real_mes,
         coalesce((select ra_ansr from real_ansr where ra_mes = v_last_real_mes), 0)::float8,
         case when v_is_partial
              then ((select ge.base_ansr from global_emp ge) * v_partial_workdays::float8 / 23.0)
              else 0 end::float8,
         coalesce((select rg_gastos from real_gastos where rg_mes = v_last_real_mes), 0)::float8,
         case when v_is_partial
              then ((select gv.base_gastos from global_vendor gv) * v_partial_workdays::float8 / 23.0)
              else 0 end::float8,
         v_is_partial,
         false

  union all

  -- ── Entirely future months ────────────────────────────────────────────────
  select fc.fc_mes,
         0::float8,
         fc.fc_ansr,
         0::float8,
         fc.fc_gastos,
         false,
         true
  from forecast_future fc

  order by 1;
end;
$$;

grant execute on function public.get_global_monthly_ter_with_forecast(integer) to authenticated;
