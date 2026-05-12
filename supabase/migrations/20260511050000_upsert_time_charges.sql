-- =============================================================================
-- Función para forzar el upsert de imputaciones de tiempo.
-- A diferencia de load_time_expense (que usa ON CONFLICT DO NOTHING),
-- esta función reemplaza la fila existente con los nuevos valores.
-- Se usa cuando el usuario confirma que quiere sobreescribir un "duplicado".
-- =============================================================================

create or replace function public.upsert_time_charges(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = te, public
as $$
declare
  v_count integer;
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
    from jsonb_array_elements(p_rows) e
    on conflict on constraint uq_time_charge do update set
      rank_code              = excluded.rank_code,
      grade                  = excluded.grade,
      accounting_date        = excluded.accounting_date,
      week_ending_date       = excluded.week_ending_date,
      charged_hours          = excluded.charged_hours,
      nsr_revenue            = excluded.nsr_revenue,
      eaf_reserve_allocation = excluded.eaf_reserve_allocation,
      ansr_revenue           = excluded.ansr_revenue,
      labor_cost             = excluded.labor_cost,
      labor_cost_rate        = excluded.labor_cost_rate,
      tech_uplift_cost       = excluded.tech_uplift_cost,
      tech_product_cost      = excluded.tech_product_cost,
      tech_product_cost_rate = excluded.tech_product_cost_rate,
      margin_cost            = excluded.margin_cost,
      margin_cost_rate       = excluded.margin_cost_rate,
      rate_card_rate         = excluded.rate_card_rate,
      rate_card_amount       = excluded.rate_card_amount,
      transaction_type_code  = excluded.transaction_type_code,
      relieved_flag          = excluded.relieved_flag,
      loaded_at              = now()
    returning id
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

grant execute on function public.upsert_time_charges(jsonb) to authenticated;
