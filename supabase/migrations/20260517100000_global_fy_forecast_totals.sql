-- =============================================================================
-- RPC: get_global_fy_forecast_totals
-- Devuelve UNA FILA con los totales reales del FY + estimación del resto
-- del año (días restantes mes parcial + meses futuros).
-- Métricas: horas, nsr, ansr, coste_margen, gastos.
-- margen_bruto se puede derivar en cliente: ansr - coste_margen.
-- =============================================================================

drop function if exists public.get_global_fy_forecast_totals(integer);

create function public.get_global_fy_forecast_totals(
  p_fiscal_year integer default null
)
returns table (
  -- real acumulado
  horas_real    float8,
  nsr_real      float8,
  ansr_real     float8,
  coste_real    float8,
  gastos_real   float8,
  -- estimación días/meses restantes
  horas_fc      float8,
  nsr_fc        float8,
  ansr_fc       float8,
  coste_fc      float8,
  gastos_fc     float8,
  -- metadata
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

  -- Última fecha con datos reales
  select max(coalesce(tc.accounting_date, tc.transaction_date))
    into v_last_real_date
  from fact_time_charge tc
  where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end;

  if v_last_real_date is null then return; end if;

  v_last_real_mes := to_char(v_last_real_date, 'YYYY-MM');

  v_is_partial := v_last_real_date <
    (date_trunc('month', v_last_real_date) + interval '1 month' - interval '1 day')::date;

  -- Mes de referencia de tasas: último mes COMPLETO antes del parcial
  v_rate_ref_mes := to_char(
    date_trunc('month', to_date(v_last_real_mes, 'YYYY-MM')) - interval '1 day',
    'YYYY-MM'
  );

  -- Días laborables restantes del mes parcial
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
  -- ── Totales reales acumulados ─────────────────────────────────────────────
  rt as (
    select
      coalesce(sum(tc.charged_hours), 0)::float8  as rt_horas,
      coalesce(sum(tc.nsr_revenue),   0)::float8  as rt_nsr,
      coalesce(sum(tc.ansr_revenue),  0)::float8  as rt_ansr,
      coalesce(sum(tc.margin_cost),   0)::float8  as rt_coste,
      count(distinct tc.engagement_id)::int       as rt_eng
    from fact_time_charge tc
    where coalesce(tc.accounting_date, tc.transaction_date) between v_fy_start and v_fy_end
  ),
  rg as (
    select coalesce(sum(x.expense_amount), 0)::float8 as rg_gastos
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
  ),
  -- ── Tasas medias por empleado (últimos 3 meses completos) ─────────────────
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
  -- ── Tasas medias por proveedor (últimos 3 meses completos) ────────────────
  vendor_ranked as (
    select x.vendor_id,
           to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as vr_mes,
           sum(x.expense_amount)::float8 as vr_gasto,
           row_number() over (
             partition by x.vendor_id
             order by to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') desc
           ) as rn
    from fact_expense x
    where coalesce(x.accounting_date, x.transaction_date) between v_fy_start and v_fy_end
      and to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') <= v_rate_ref_mes
    group by 1, 2
  ),
  global_vendor as (
    select coalesce(sum(vr_gasto / 3.0), 0)::float8 as base_gastos
    from (
      select vendor_id, sum(vr_gasto) as vr_gasto
      from vendor_ranked
      where rn <= 3
      group by 1
    ) v3
  ),
  -- ── Días laborables de los meses futuros del FY ───────────────────────────
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
      select fs.fs_mes,
             count(*) as wd_count
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
  -- ── Total días a estimar = resto mes parcial + meses futuros ─────────────
  total_fc_days as (
    select (v_partial_workdays + coalesce(fw.total_workdays, 0))::float8 as days
    from future_workdays fw
  )
  -- ── Resultado final ───────────────────────────────────────────────────────
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

grant execute on function public.get_global_fy_forecast_totals(integer) to authenticated;
