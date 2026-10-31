-- Expectation Gap agregado por destino (documento maestro, sección 8):
-- se publica solo con 10 o más respuestas. Nunca expone filas individuales.

-- Vista interna (solo service role): incluye destinos con n < 10 para análisis.
create or replace view public.destination_gap_stats
with (security_invoker = true) as
select
  e.destination_id,
  round(avg(e.gap), 2)::numeric(4, 2) as gap,
  count(*)::integer                    as n
from public.experiences e
where e.gap is not null
group by e.destination_id;

revoke all on public.destination_gap_stats from anon, authenticated;
grant select on public.destination_gap_stats to service_role;

-- Función pública: devuelve el gap del destino solo si n >= 10; si no, ninguna fila.
-- security definer para agregar sobre todas las experiencias sin abrir la tabla.
create or replace function public.get_destination_gap(p_destination_id text)
returns table (destination_id text, gap numeric, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.destination_id,
    round(avg(e.gap), 2) as gap,
    count(*)::integer    as n
  from public.experiences e
  where e.destination_id = p_destination_id
    and e.gap is not null
  group by e.destination_id
  having count(*) >= 10;
$$;

revoke all on function public.get_destination_gap(text) from public;
grant execute on function public.get_destination_gap(text) to anon, authenticated, service_role;

-- Listado público de gaps publicables (n >= 10) para todos los destinos.
create or replace function public.list_destination_gaps()
returns table (destination_id text, gap numeric, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.destination_id,
    round(avg(e.gap), 2) as gap,
    count(*)::integer    as n
  from public.experiences e
  where e.gap is not null
  group by e.destination_id
  having count(*) >= 10;
$$;

revoke all on function public.list_destination_gaps() from public;
grant execute on function public.list_destination_gaps() to anon, authenticated, service_role;
