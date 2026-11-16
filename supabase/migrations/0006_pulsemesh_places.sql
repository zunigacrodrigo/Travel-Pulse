-- Travel Pulse 0.8 — PulseMesh por lugar: un reporte puede referirse a un lugar concreto de OpenStreetMap.
--
-- Por qué: los reportes de 0005 son por ciudad. Para que una observación («fila larga», «cerrado») afecte al itinerario
-- de quien tiene ESE lugar en su viaje, el reporte tiene que saber de qué lugar habla.
--
-- Reglas (se mantienen las de 0005):
--   * El lugar es opcional: un reporte sin lugar sigue siendo válido.
--   * `place_id` es el identificador de OpenStreetMap («node/123», «way/456», «relation/789»). El formato lo impone la
--     base de datos, no el cliente: nada que no sea ese formato llega a la tabla (ni a una consulta construida con él).
--   * `place_name` solo existe junto a un `place_id` y tiene tamaño acotado.
--   * Los reportes siguen siendo inmutables: no se puede cambiar el lugar de uno ya publicado (no hay permiso de UPDATE).
--   * La lectura pública sigue pasando por la vista, sin `user_id`.
--   * La corroboración sigue contando PERSONAS distintas; el lugar no cambia esa regla.

/* ------------------------------------------------------------------ */
/* Columnas                                                            */
/* ------------------------------------------------------------------ */

alter table public.pulse_signals
  add column if not exists place_id   text,
  add column if not exists place_name text;

-- En las expresiones regulares de Postgres, `^` y `$` anclan al inicio y al final del texto completo (no hay modo de
-- líneas por defecto), así que un salto de línea o un espacio dentro del valor no pasa. Lo comprueba una prueba explícita
-- (rls_pulsemesh_places.sql) y una mutación sin anclas.
alter table public.pulse_signals
  drop constraint if exists pulse_signals_place_id_format,
  add  constraint pulse_signals_place_id_format
    check (place_id is null or place_id ~ '^(node|way|relation)/[0-9]{1,15}$'),
  drop constraint if exists pulse_signals_place_name_needs_id,
  add  constraint pulse_signals_place_name_needs_id
    check (place_name is null or (place_id is not null and char_length(place_name) between 1 and 120));

create index if not exists pulse_signals_place_idx
  on public.pulse_signals (city_key, place_id, expires_at desc)
  where place_id is not null;

/* ------------------------------------------------------------------ */
/* Permisos: el cliente decide el lugar al publicar, y solo ahí        */
/* ------------------------------------------------------------------ */

-- 0005 limitó el INSERT por columnas. Las nuevas necesitan su propio permiso; UPDATE sigue sin existir para nadie.
grant insert (place_id, place_name) on public.pulse_signals to authenticated;

/* ------------------------------------------------------------------ */
/* Lectura pública: columnas nuevas AL FINAL (exigencia de create or replace view) */
/* ------------------------------------------------------------------ */

create or replace view public.pulse_signals_public as
select
  s.id, s.city_key, s.category, s.kind, s.title, s.detail,
  s.price_amount, s.price_currency, s.lat_approx, s.lon_approx,
  s.observed_at, s.expires_at,
  (1 + count(c.user_id) filter (where c.verdict = 'confirma'))::integer as independent_count,
  (count(c.user_id) filter (where c.verdict = 'contradice'))::integer as contradicted_count,
  case
    when count(c.user_id) filter (where c.verdict = 'contradice') >= 2
         and count(c.user_id) filter (where c.verdict = 'contradice') > count(c.user_id) filter (where c.verdict = 'confirma')
      then 'en_disputa'
    when 1 + count(c.user_id) filter (where c.verdict = 'confirma') >= 3 then 'corroborada'
    else 'por_confirmar'
  end as state,
  (s.user_id = (select auth.uid())) as is_mine,
  s.place_id,
  s.place_name
from public.pulse_signals s
left join public.pulse_confirmations c on c.signal_id = s.id
where s.hidden = false and s.expires_at > now()
group by s.id;

revoke all on public.pulse_signals_public from public;
grant select on public.pulse_signals_public to anon, authenticated;
