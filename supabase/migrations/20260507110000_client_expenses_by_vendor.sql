-- =============================================================================
-- Función: Gastos por vendor agregados por cliente (todos sus engagements)
-- Devuelve el desglose de gastos agrupado por vendor y tipo de transacción
-- para todos los engagements del cliente dado.
-- =============================================================================

create or replace function public.get_client_expenses_by_vendor(
  p_client_id   text,
  p_fiscal_year integer default null
)
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
  join dim_engagement  e   on e.engagement_id   = x.engagement_id
  join dim_project     p   on p.project_id      = e.project_id
  join dim_opportunity o   on o.opportunity_id  = p.opportunity_id
  join dim_client      c   on c.client_id       = o.client_id
  left join dim_vendor   v   on v.vendor_id     = x.vendor_id
  left join dim_category cat on cat.category_code = x.category_code
  where c.client_id = p_client_id
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year
    )
  group by x.vendor_id, v.vendor_name, x.transaction_type_code, cat.category_description
  order by total_gasto desc;
$$;

grant execute on function public.get_client_expenses_by_vendor(text, integer) to authenticated;
