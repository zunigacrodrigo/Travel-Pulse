-- Pruebas de 0006_pulsemesh_places.sql: reportes de viajeros asociados a un lugar concreto.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute 'reset role'; execute 'set role authenticated';
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'reset role'; execute 'set role anon';
end $$;
create or replace function pg_temp.as_admin() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create or replace function pg_temp.check(ok boolean, name text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FALLA: %', name; end if;
  raise notice 'ok  - %', name;
end $$;
create or replace function pg_temp.fails(stmt text, name text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then raise notice 'ok  - % (%)', name, sqlstate; return;
  end;
  raise exception 'FALLA: % — debía fallar y no falló', name;
end $$;

select pg_temp.as_admin();
insert into auth.users (id) values
  ('f1000000-0000-0000-0000-000000000001'), ('f2000000-0000-0000-0000-000000000002'),
  ('f3000000-0000-0000-0000-000000000003'), ('f4000000-0000-0000-0000-000000000004');

-- ------------------------------------------------------------ publicar con lugar
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'Fila larga', 'way/1370081491', 'Museu de Arte de São Paulo');
insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'condiciones', 'cerrado', 'Cerrado hoy', 'node/6736650585', 'Bar Charles Edward');
select pg_temp.check((select count(*) from public.pulse_signals where place_id is not null) = 2, 'se puede reportar asociando un lugar de OpenStreetMap');

-- un reporte sin lugar sigue siendo válido (compatibilidad con 0005)
insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'tranquilo', 'Barrio tranquilo');
select pg_temp.check((select count(*) from public.pulse_signals where place_id is null) = 1, 'un reporte sin lugar sigue siendo válido');

-- ------------------------------------------------------------ formato del id del lugar
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'abc', 'Lugar')$q$, 'un place_id sin formato de OpenStreetMap se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/abc', 'Lugar')$q$, 'way/ con letras se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/', 'Lugar')$q$, 'way/ sin número se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/1; drop table public.pulse_signals', 'Lugar')$q$, 'un place_id con SQL se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'Way/1', 'Lugar')$q$, 'el tipo debe ir en minúsculas');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', ' way/1', 'Lugar')$q$, 'un place_id con espacio inicial se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/1' || chr(10) || 'node/2', 'Lugar')$q$, 'un place_id con salto de línea se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/1234567890123456', 'Lugar')$q$, 'un número de más de 15 dígitos se rechaza');
select pg_temp.check(true, 'formatos válidos: node, way y relation');
insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name) values
  ('f1000000-0000-0000-0000-000000000001', 'santiago-cl', 'afluencia', 'tranquilo', 'ok uno', 'node/1', 'A'),
  ('f1000000-0000-0000-0000-000000000001', 'santiago-cl', 'afluencia', 'tranquilo', 'ok dos', 'way/123', 'B'),
  ('f1000000-0000-0000-0000-000000000001', 'santiago-cl', 'afluencia', 'tranquilo', 'ok tres', 'relation/9', 'C');

-- ------------------------------------------------------------ nombre del lugar
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'Nombre sin id')$q$, 'un nombre de lugar sin place_id se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/5', '')$q$, 'un nombre de lugar vacío se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, place_id, place_name)
  values ('f1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'fila_larga', 'x yz', 'way/5', repeat('n', 121))$q$, 'un nombre de más de 120 caracteres se rechaza');

-- ------------------------------------------------------------ inmutabilidad y permisos
select pg_temp.fails($q$update public.pulse_signals set place_id = 'way/2' where place_id = 'way/1370081491'$q$, 'no se puede cambiar el lugar de un reporte ya publicado');

-- ------------------------------------------------------------ lectura pública por lugar, sin identidad
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.pulse_signals_public where place_id = 'way/1370081491') = 1, 'cualquiera puede leer los reportes de un lugar');
select pg_temp.check((select place_name from public.pulse_signals_public where place_id = 'way/1370081491') = 'Museu de Arte de São Paulo', 'la vista pública entrega el nombre del lugar');
select pg_temp.check((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pulse_signals_public' and column_name = 'user_id') = 0, 'la vista pública sigue sin exponer user_id');
select pg_temp.fails($q$select * from public.pulse_signals$q$, 'anon sigue sin acceso a la tabla base');
select pg_temp.check((select count(*) from public.pulse_signals_public where place_id = 'node/6736650585' and city_key = 'sao-paulo-br') = 1, 'se puede filtrar por ciudad y lugar a la vez');
select pg_temp.check((select count(*) from public.pulse_signals_public where place_id = 'way/999') = 0, 'un lugar sin reportes devuelve cero filas (no un error)');

-- ------------------------------------------------------------ compatibilidad de la vista
select pg_temp.as_admin();
select pg_temp.check(
  (select ordinal_position from information_schema.columns where table_name = 'pulse_signals_public' and column_name = 'place_id') >
  (select ordinal_position from information_schema.columns where table_name = 'pulse_signals_public' and column_name = 'is_mine'),
  'las columnas nuevas van al final de la vista (compatibilidad con 0005)');
select pg_temp.check(exists (select 1 from pg_indexes where tablename = 'pulse_signals' and indexname = 'pulse_signals_place_idx'), 'existe el índice por ciudad y lugar');

-- ------------------------------------------------------------ la corroboración sigue contando personas distintas, por lugar
select set_config('t.sig', (select id::text from public.pulse_signals where place_id = 'way/1370081491'), false);
select pg_temp.as_user('f2000000-0000-0000-0000-000000000002');
insert into public.pulse_confirmations (signal_id, user_id, verdict) values (current_setting('t.sig')::uuid, 'f2000000-0000-0000-0000-000000000002', 'confirma');
select pg_temp.as_user('f3000000-0000-0000-0000-000000000003');
insert into public.pulse_confirmations (signal_id, user_id, verdict) values (current_setting('t.sig')::uuid, 'f3000000-0000-0000-0000-000000000003', 'confirma');
select pg_temp.as_anon();
select pg_temp.check((select state = 'corroborada' and independent_count = 3 from public.pulse_signals_public where place_id = 'way/1370081491'), '3 personas distintas corroboran el reporte del lugar');
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict) values (current_setting('t.sig')::uuid, 'f1000000-0000-0000-0000-000000000001', 'confirma')$q$, 'el autor no puede confirmar su propio reporte de un lugar');

-- ------------------------------------------------------------ borrar lo propio también borra los reportes con lugar
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select public.delete_my_cloud_data();
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.pulse_signals_public where place_id is not null) = 0, 'borrar mis datos elimina también mis reportes con lugar');
select pg_temp.as_admin();
\echo PULSEMESH PLACES OK
