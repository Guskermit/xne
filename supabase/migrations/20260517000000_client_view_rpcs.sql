-- =============================================================================
-- Funciones para la página "Visión por Cliente"
--
--  1. get_client_engagement_kpis   → KPIs a nivel engagement de un cliente
--  2. get_client_expense_lines     → líneas individuales de gasto (facturas)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. KPIs por engagement filtrados por cliente
-- ---------------------------------------------------------------------------
create or replace function public.get_client_engagement_kpis(
  p_client_id   text,
  p_fiscal_year integer default null
)
returns table (
  engagement_id    text,
  engagement_name  text,
  project_name     text,
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
    where p_fiscal_year is null
       or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    group by engagement_id
  ),
  ex as (
    select
      engagement_id,
      sum(expense_amount) as gasto_total
    from fact_expense
    where p_fiscal_year is null
       or te.fiscal_year(coalesce(accounting_date, transaction_date)) = p_fiscal_year
    group by engagement_id
  )
  select
    e.engagement_id,
    e.engagement_name,
    p.project_name,
    coalesce(tc.horas,        0)::float8                              as horas,
    coalesce(tc.nsr,          0)::float8                              as nsr,
    coalesce(tc.ansr,         0)::float8                              as ansr,
    coalesce(tc.coste_margen, 0)::float8                              as coste_margen,
    coalesce(tc.ansr - tc.coste_margen, 0)::float8                    as margen_bruto,
    coalesce(ex.gasto_total,  0)::float8                              as gasto_total,
    (coalesce(tc.ansr, 0) + coalesce(ex.gasto_total, 0))::float8      as ter,
    b.budget::float8                                                  as budget,
    coalesce(b.status, 'activo')                                      as status
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
-- 2. Líneas individuales de gasto (facturas) de un cliente
--    Permite filtrar por vendor, tipo de transacción y categoría para
--    implementar el desplegable de la tabla de gastos.
-- ---------------------------------------------------------------------------
create or replace function public.get_client_expense_lines(
  p_client_id              text,
  p_vendor_id              text    default null,
  p_transaction_type_code  text    default null,
  p_category_description   text    default null,
  p_fiscal_year            integer default null
)
returns table (
  engagement_name       text,
  vendor_name           text,
  transaction_type_code text,
  category_description  text,
  expense_description   text,
  transaction_date      date,
  accounting_date       date,
  expense_amount        float8,
  voucher_id            text
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    e.engagement_name,
    coalesce(v.vendor_name, '(sin vendor)')         as vendor_name,
    x.transaction_type_code,
    coalesce(cat.category_description, '—')         as category_description,
    x.expense_description,
    x.transaction_date,
    x.accounting_date,
    x.expense_amount::float8,
    x.voucher_id
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
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year
    )
  order by coalesce(x.accounting_date, x.transaction_date) desc nulls last;
$$;

grant execute on function public.get_client_expense_lines(text, text, text, text, integer) to authenticated;
