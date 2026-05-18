-- =============================================================================
-- Add business_unit to dim_client: 'Studio+' | 'Hospitality'
-- =============================================================================
alter table te.dim_client
  add column if not exists business_unit text default 'Studio+'
  check (business_unit in ('Studio+', 'Hospitality'));

-- Update admin_list_clients to return business_unit
drop function if exists public.admin_list_clients();

create function public.admin_list_clients()
returns table (client_id text, client_name text, color text, business_unit text)
language sql security definer stable
set search_path = te, public
as $$
  select client_id, client_name, color, coalesce(business_unit, 'Studio+')
  from dim_client
  order by client_name;
$$;
grant execute on function public.admin_list_clients() to authenticated;

-- RPC to set business_unit
create or replace function public.admin_set_client_business_unit(
  p_client_id    text,
  p_business_unit text
)
returns void
language sql security definer
set search_path = te, public
as $$
  update dim_client
  set business_unit = p_business_unit
  where client_id = p_client_id;
$$;
grant execute on function public.admin_set_client_business_unit(text, text) to authenticated;
