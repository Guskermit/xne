-- =============================================================================
-- Gastos mensuales globales por proveedor (sin filtro de cliente)
-- Usado en la gráfica de barras apiladas de la página de resumen global
-- =============================================================================
create or replace function public.get_global_monthly_expenses_by_vendor(
  p_fiscal_year integer default null
)
returns table (
  mes          text,
  vendor_id    text,
  vendor_name  text,
  gasto_total  float8
)
language sql
security definer
stable
set search_path = te, public
as $$
  select
    to_char(coalesce(x.accounting_date, x.transaction_date), 'YYYY-MM') as mes,
    coalesce(x.vendor_id, '—')                                           as vendor_id,
    coalesce(v.vendor_name, '(sin vendor)')                              as vendor_name,
    sum(x.expense_amount)::float8                                        as gasto_total
  from fact_expense x
  left join dim_vendor v on v.vendor_id = x.vendor_id
  where coalesce(x.accounting_date, x.transaction_date) is not null
    and (
      p_fiscal_year is null
      or te.fiscal_year(coalesce(x.accounting_date, x.transaction_date)) = p_fiscal_year
    )
  group by 1, 2, 3
  order by 1, 4 desc;
$$;

grant execute on function public.get_global_monthly_expenses_by_vendor(integer) to authenticated;
