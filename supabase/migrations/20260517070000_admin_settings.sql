-- =============================================================================
-- Admin settings: color column on dim_client and dim_vendor
-- =============================================================================
alter table te.dim_client
  add column if not exists color text;

alter table te.dim_vendor
  add column if not exists color text;

-- Admin RPCs ---------------------------------------------------------------

-- List clients for admin
create or replace function public.admin_list_clients()
returns table (client_id text, client_name text, color text)
language sql security definer stable
set search_path = te, public
as $$
  select client_id, client_name, color
  from dim_client
  order by client_name;
$$;
grant execute on function public.admin_list_clients() to authenticated;

-- Update client color
create or replace function public.admin_set_client_color(p_client_id text, p_color text)
returns void
language sql security definer
set search_path = te, public
as $$
  update dim_client set color = p_color where client_id = p_client_id;
$$;
grant execute on function public.admin_set_client_color(text, text) to authenticated;

-- List vendors for admin
create or replace function public.admin_list_vendors()
returns table (vendor_id text, vendor_name text, color text)
language sql security definer stable
set search_path = te, public
as $$
  select vendor_id, vendor_name, color
  from dim_vendor
  order by vendor_name;
$$;
grant execute on function public.admin_list_vendors() to authenticated;

-- Update vendor color
create or replace function public.admin_set_vendor_color(p_vendor_id text, p_color text)
returns void
language sql security definer
set search_path = te, public
as $$
  update dim_vendor set color = p_color where vendor_id = p_vendor_id;
$$;
grant execute on function public.admin_set_vendor_color(text, text) to authenticated;

-- List engagements for admin (with budget + status from engagement_budget)
create or replace function public.admin_list_engagements()
returns table (
  engagement_id   text,
  engagement_name text,
  client_name     text,
  budget          numeric,
  status          text
)
language sql security definer stable
set search_path = te, public
as $$
  select
    e.engagement_id,
    e.engagement_name,
    c.client_name,
    eb.budget,
    coalesce(eb.status, 'active') as status
  from dim_engagement e
  join dim_project     p  on p.project_id     = e.project_id
  join dim_opportunity o  on o.opportunity_id = p.opportunity_id
  join dim_client      c  on c.client_id      = o.client_id
  left join engagement_budget eb on eb.engagement_id = e.engagement_id
  order by c.client_name, e.engagement_name;
$$;
grant execute on function public.admin_list_engagements() to authenticated;

-- Upsert engagement budget + status
create or replace function public.admin_set_engagement(
  p_engagement_id text,
  p_budget        numeric,
  p_status        text
)
returns void
language sql security definer
set search_path = te, public
as $$
  insert into engagement_budget (engagement_id, budget, status, updated_at)
  values (p_engagement_id, p_budget, p_status, now())
  on conflict (engagement_id)
  do update set
    budget     = excluded.budget,
    status     = excluded.status,
    updated_at = excluded.updated_at;
$$;
grant execute on function public.admin_set_engagement(text, numeric, text) to authenticated;
