-- Travel Pulse 0.4 — datos del viajero en la nube (Travel DNA, guardados y viajes).
--
-- Principios:
--   * Local primero: la app funciona sin cuenta; la nube es opcional y la activa el usuario.
--   * Cada fila pertenece a un usuario y solo ese usuario puede leerla o escribirla (RLS).
--   * El rol `anon` no tiene acceso a ninguna tabla de usuario.
--   * Tamaños acotados para impedir que una cuenta use la base como almacenamiento libre.
--   * El usuario puede borrar todo lo suyo con `delete_my_cloud_data()`.
--
-- Reutiliza `profiles` y `saved_destinations` de 0001; solo añade columnas y `user_trips`.

/* ------------------------------------------------------------------ */
/* Travel DNA en el perfil                                             */
/* ------------------------------------------------------------------ */

alter table public.profiles
  add column if not exists dna jsonb
    check (dna is null or (jsonb_typeof(dna) = 'object' and pg_column_size(dna) <= 20000)),
  add column if not exists dna_updated_at timestamptz;

-- 0001 limita las columnas editables de `profiles` (el usuario no puede cambiar su `role`).
-- Las columnas nuevas necesitan su propio permiso; `role` sigue sin poder editarse.
grant update (dna, dna_updated_at) on public.profiles to authenticated;

/* ------------------------------------------------------------------ */
/* Guardados: instantánea de lo que el usuario guardó                  */
/* ------------------------------------------------------------------ */

alter table public.saved_destinations
  add column if not exists snapshot jsonb
    check (snapshot is null or (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 20000)),
  add column if not exists updated_at timestamptz not null default now();

-- 0001 solo permitía leer, crear y borrar; sincronizar necesita actualizar lo propio.
drop policy if exists "propios: editar" on public.saved_destinations;
create policy "propios: editar" on public.saved_destinations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.saved_destinations to authenticated;

drop trigger if exists saved_destinations_touch on public.saved_destinations;
create trigger saved_destinations_touch before update on public.saved_destinations
  for each row execute function public.touch_updated_at();

/* ------------------------------------------------------------------ */
/* Viajes (Trip Twin)                                                  */
/* ------------------------------------------------------------------ */

create table if not exists public.user_trips (
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Identificador estable generado en el dispositivo; permite sincronizar sin duplicar.
  local_id    text not null check (local_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  trip        jsonb not null check (jsonb_typeof(trip) = 'object' and pg_column_size(trip) <= 20000),
  activities  jsonb not null check (jsonb_typeof(activities) = 'array' and pg_column_size(activities) <= 400000),
  plan        jsonb not null check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 200000),
  -- Historial de deshacer/rehacer: {"past":[...],"future":[...]}.
  history     jsonb not null default '{"past":[],"future":[]}'
              check (jsonb_typeof(history) = 'object' and pg_column_size(history) <= 1500000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, local_id)
);

drop trigger if exists user_trips_touch on public.user_trips;
create trigger user_trips_touch before update on public.user_trips
  for each row execute function public.touch_updated_at();

alter table public.user_trips enable row level security;

drop policy if exists "propios: leer" on public.user_trips;
create policy "propios: leer" on public.user_trips
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "propios: crear" on public.user_trips;
create policy "propios: crear" on public.user_trips
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "propios: editar" on public.user_trips;
create policy "propios: editar" on public.user_trips
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "propios: borrar" on public.user_trips;
create policy "propios: borrar" on public.user_trips
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.user_trips from anon;
revoke all on public.user_trips from public;
grant select, insert, update, delete on public.user_trips to authenticated;

/* ------------------------------------------------------------------ */
/* Límites por usuario                                                 */
/* ------------------------------------------------------------------ */

create or replace function public.enforce_user_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  current_rows integer;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into current_rows using new.user_id;
  if current_rows >= max_rows then
    raise exception 'Límite de % filas por usuario alcanzado en %', max_rows, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists user_trips_limit on public.user_trips;
create trigger user_trips_limit before insert on public.user_trips
  for each row execute function public.enforce_user_row_limit(50);

drop trigger if exists saved_destinations_limit on public.saved_destinations;
create trigger saved_destinations_limit before insert on public.saved_destinations
  for each row execute function public.enforce_user_row_limit(200);

/* ------------------------------------------------------------------ */
/* Derecho a borrar lo propio                                          */
/* ------------------------------------------------------------------ */

-- `security invoker`: se ejecuta con los permisos y la RLS del usuario que la llama,
-- así que solo puede borrar sus propias filas. No borra la cuenta de acceso (auth.users).
create or replace function public.delete_my_cloud_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.user_trips where user_id = (select auth.uid());
  delete from public.saved_destinations where user_id = (select auth.uid());
  update public.profiles set dna = null, dna_updated_at = null where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_cloud_data() from public, anon;
grant execute on function public.delete_my_cloud_data() to authenticated;
