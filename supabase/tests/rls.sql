-- Pruebas de RLS de 0004_user_cloud_data.sql. Las ejecuta rls.sh en un Postgres temporal.
-- Cada caso lanza una excepción si falla; al final imprime "RLS OK".
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute 'reset role';
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'reset role';
  execute 'set role anon';
end $$;

create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

create or replace function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLA: %', name; end if;
  raise notice 'ok  - %', name;
end $$;

-- Espera que `stmt` falle; devuelve el sqlstate. Falla si no lanza error.
create or replace function pg_temp.fails(stmt text, name text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok  - % (%)', name, sqlstate;
    return;
  end;
  raise exception 'FALLA: % — debía fallar y no falló', name;
end $$;

-- Datos de referencia mínimos y dos usuarios (como administrador).
select pg_temp.as_admin();
insert into public.sources (id, name, license, max_age_days, reliability) values ('curaduria-tp', 'Curaduría', 'interna', 90, 0.75);
insert into public.destinations (id, name, country, lat, lon, altitude_m, tags, risk_source_id, risk_observed_at, blurb, poster)
  values ('CUZ', 'Cusco', 'Perú', -13.5, -71.9, 3300, '{}', 'curaduria-tp', '2026-10-01', 'x', '{}'),
         ('SCL', 'Santiago', 'Chile', -33.4, -70.6, 520, '{}', 'curaduria-tp', '2026-10-01', 'x', '{}');
insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');

select pg_temp.check((select count(*) from public.profiles) = 2, 'el perfil se crea solo al registrarse');

-- ---------------------------------------------------------------- A escribe lo suyo
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.profiles set dna = '{"interests":["aventura"]}', dna_updated_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select dna->'interests'->>0 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'aventura', 'A guarda su DNA');
select pg_temp.check((select count(*) from public.profiles) = 1, 'A solo ve su propio perfil');

insert into public.user_trips (user_id, local_id, trip, activities, plan)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'active', '{"destination":"Cusco"}', '[]', '{}');
select pg_temp.check((select count(*) from public.user_trips) = 1, 'A crea y lee su viaje');

insert into public.saved_destinations (user_id, destination_id, snapshot)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'CUZ', '{"score":71}');
update public.saved_destinations set snapshot = '{"score":80}' where destination_id = 'CUZ';
select pg_temp.check((select snapshot->>'score' from public.saved_destinations where destination_id = 'CUZ') = '80', 'A actualiza un guardado (política de edición)');

select pg_temp.fails($q$insert into public.user_trips (user_id, local_id, trip, activities, plan)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'x', '{}', '[]', '{}')$q$, 'A no puede crear un viaje a nombre de B');
select pg_temp.fails($q$insert into public.saved_destinations (user_id, destination_id)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'SCL')$q$, 'A no puede guardar un destino a nombre de B');

-- ---------------------------------------------------------------- B no ve ni toca lo de A
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.user_trips) = 0, 'B no ve los viajes de A');
select pg_temp.check((select count(*) from public.saved_destinations) = 0, 'B no ve los guardados de A');
select pg_temp.check((select dna from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') is null, 'B no lee el DNA de A');

with u as (update public.user_trips set trip = '{"hack":true}' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select pg_temp.check((select count(*) from u) = 0, 'B no puede editar el viaje de A');
with d as (delete from public.user_trips where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select pg_temp.check((select count(*) from d) = 0, 'B no puede borrar el viaje de A');
with u as (update public.profiles set dna = '{"hack":true}' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
  select pg_temp.check((select count(*) from u) = 0, 'B no puede editar el DNA de A');

select pg_temp.fails($q$update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, 'un usuario no puede ascenderse a admin');

-- ---------------------------------------------------------------- anónimo
select pg_temp.as_anon();
select pg_temp.fails('select * from public.user_trips', 'anon no puede leer viajes');
select pg_temp.fails($q$insert into public.user_trips (user_id, local_id, trip, activities, plan)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'z', '{}', '[]', '{}')$q$, 'anon no puede escribir viajes');

-- ---------------------------------------------------------------- límites y tamaños
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.user_trips (user_id, local_id, trip, activities, plan)
  select 'bbbbbbbb-0000-0000-0000-000000000002', 't' || g, '{}', '[]', '{}' from generate_series(1, 50) g;
select pg_temp.fails($q$insert into public.user_trips (user_id, local_id, trip, activities, plan)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'extra', '{}', '[]', '{}')$q$, 'el viaje 51 supera el límite de 50');
select pg_temp.fails($q$insert into public.user_trips (user_id, local_id, trip, activities, plan)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'big', jsonb_build_object('x', repeat('a', 30000)), '[]', '{}')$q$, 'un viaje de tamaño excesivo se rechaza');
select pg_temp.fails($q$update public.profiles set dna = jsonb_build_object('x', repeat('a', 30000)) where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, 'un DNA de tamaño excesivo se rechaza');
select pg_temp.fails($q$insert into public.user_trips (user_id, local_id, trip, activities, plan)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'bad id!', '{}', '[]', '{}')$q$, 'local_id inválido se rechaza');

-- ---------------------------------------------------------------- derecho a borrar lo propio
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select public.delete_my_cloud_data();
select pg_temp.check((select count(*) from public.user_trips) = 0 and (select count(*) from public.saved_destinations) = 0, 'A borra todo lo suyo');
select pg_temp.check((select dna from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') is null, 'A borra su DNA');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.user_trips) = 50, 'borrar lo de A no toca lo de B');
select pg_temp.as_anon();
select pg_temp.fails('select public.delete_my_cloud_data()', 'anon no puede ejecutar delete_my_cloud_data');

select pg_temp.as_admin();
\echo RLS OK
