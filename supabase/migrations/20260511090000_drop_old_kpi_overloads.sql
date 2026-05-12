-- =============================================================================
-- Elimina sobrecargas antiguas de get_engagement_kpis que conviven con la
-- versión (integer, boolean) y causan "Could not choose best candidate function".
-- =============================================================================

-- Versión sin parámetros (creada por migraciones 000, 020, 040)
drop function if exists public.get_engagement_kpis();

-- Versión con solo un parámetro (creada por migración 090)
drop function if exists public.get_engagement_kpis(integer);

-- Asegurarse de que la versión final existe con sus permisos
grant execute on function public.get_engagement_kpis(integer, boolean) to authenticated;
