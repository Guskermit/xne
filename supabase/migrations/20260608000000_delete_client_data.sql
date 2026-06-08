-- =============================================================================
-- RPC para eliminar todos los datos de un cliente concreto.
-- Borra hechos (time charges y expenses) y dimensiones propias del cliente
-- (engagements, projects, opportunities, client).
-- Las dimensiones compartidas (employees, vendors, accounts, etc.) NO se
-- eliminan porque pueden pertenecer a otros clientes.
-- =============================================================================

create or replace function public.delete_client_data(p_client_id text)
returns void
language plpgsql
security definer
set search_path = te, public
as $$
begin
  -- 1. Hechos de imputaciones de horas
  delete from fact_time_charge
  where engagement_id in (
    select e.engagement_id
    from   dim_engagement  e
    join   dim_project     p on p.project_id     = e.project_id
    join   dim_opportunity o on o.opportunity_id = p.opportunity_id
    where  o.client_id = p_client_id
  );

  -- 2. Hechos de gastos
  delete from fact_expense
  where engagement_id in (
    select e.engagement_id
    from   dim_engagement  e
    join   dim_project     p on p.project_id     = e.project_id
    join   dim_opportunity o on o.opportunity_id = p.opportunity_id
    where  o.client_id = p_client_id
  );

  -- 3. Presupuestos de engagement
  delete from engagement_budget
  where engagement_id in (
    select e.engagement_id
    from   dim_engagement  e
    join   dim_project     p on p.project_id     = e.project_id
    join   dim_opportunity o on o.opportunity_id = p.opportunity_id
    where  o.client_id = p_client_id
  );

  -- 4. Engagements
  delete from dim_engagement
  where project_id in (
    select p.project_id
    from   dim_project     p
    join   dim_opportunity o on o.opportunity_id = p.opportunity_id
    where  o.client_id = p_client_id
  );

  -- 5. Proyectos
  delete from dim_project
  where opportunity_id in (
    select opportunity_id
    from   dim_opportunity
    where  client_id = p_client_id
  );

  -- 6. Oportunidades
  delete from dim_opportunity
  where client_id = p_client_id;

  -- 7. Cliente
  delete from dim_client
  where client_id = p_client_id;
end;
$$;

-- Permisos: solo usuarios autenticados pueden llamar a esta función
revoke execute on function public.delete_client_data(text) from public, anon;
grant  execute on function public.delete_client_data(text) to authenticated;
