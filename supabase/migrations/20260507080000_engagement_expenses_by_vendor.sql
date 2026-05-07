-- =============================================================================
-- Función: Gastos por vendor para un engagement
-- Devuelve el desglose de gastos agrupado por vendor y tipo de transacción.
-- =============================================================================

create or replace function public.get_engagement_expenses_by_vendor(p_engagement_id text)
returns table (
  vendor_id              text,
  vendor_name            text,
  transaction_type_code  text,
  category_description   text,
  total_gasto            float8,
  n_lineas               bigint
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    coalesce(x.vendor_id, '—')                           as vendor_id,
    coalesce(v.vendor_name, '(sin vendor)')              as vendor_name,
    x.transaction_type_code,
    coalesce(cat.category_description, '—')              as category_description,
    sum(x.expense_amount)::float8                        as total_gasto,
    count(*)::bigint                                     as n_lineas
  from fact_expense x
  left join dim_vendor   v   on v.vendor_id    = x.vendor_id
  left join dim_category cat on cat.category_code = x.category_code
  where x.engagement_id = p_engagement_id
  group by x.vendor_id, v.vendor_name, x.transaction_type_code, cat.category_description
  order by total_gasto desc;
$$;

grant execute on function public.get_engagement_expenses_by_vendor(text) to authenticated;
