-- =============================================================================
-- Corrección de v_engagement_pl
-- El JOIN directo fact_time_charge × fact_expense producía un producto
-- cartesiano que multiplicaba los gastos por el número de filas de tiempo.
-- Se pre-agrega cada tabla por separado antes del JOIN.
-- =============================================================================
set search_path = te, public;

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
