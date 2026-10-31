-- Pruebas de 0005_pulsemesh.sql: seguridad, independencia de contribuyentes, vigencia y abuso.
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
  ('a1000000-0000-0000-0000-000000000001'), ('b2000000-0000-0000-0000-000000000002'),
  ('c3000000-0000-0000-0000-000000000003'), ('d4000000-0000-0000-0000-000000000004'),
  ('e5000000-0000-0000-0000-000000000005');

-- ------------------------------------------------------------ A publica un reporte
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
insert into public.pulse_signals (user_id, city_key, category, kind, title, detail, lat_approx, lon_approx)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'condiciones', 'fila_larga', 'Fila larga en el ascensor', 'Unos 40 minutos', -33.04567, -71.61987);

select pg_temp.check((select lat_approx = -33.05 and lon_approx = -71.62 from public.pulse_signals), 'la ubicación se redondea a ~1 km en la base de datos');
select pg_temp.check((select expires_at - observed_at = interval '24 hours' from public.pulse_signals), 'el servidor fija la vigencia por categoría (condiciones = 24 h)');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, expires_at)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', 'Todo lleno', now() + interval '30 days')$q$, 'el cliente no puede fijar su propia vigencia');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, flags, hidden)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', 'Todo lleno', 0, false)$q$, 'el cliente no puede escribir flags ni hidden');

-- ------------------------------------------------------------ suplantación y datos inválidos
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('b2000000-0000-0000-0000-000000000002', 'valparaiso-cl', 'afluencia', 'lleno', 'A nombre de otro')$q$, 'no se puede reportar a nombre de otra persona');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'seguridad', 'robo', 'Hubo un robo')$q$, 'la categoría seguridad está fuera del piloto');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, price_amount, price_currency)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', 'Con precio', 5, 'CLP')$q$, 'solo la categoría precios admite monto');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, observed_at)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', 'Del futuro', now() + interval '2 days')$q$, 'no se aceptan observaciones del futuro');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title, observed_at)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', 'Muy antiguo', now() - interval '10 days')$q$, 'no se aceptan observaciones de hace más de 3 días');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', repeat('x', 200))$q$, 'un título excesivo se rechaza');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('a1000000-0000-0000-0000-000000000001', 'Valparaíso!', 'afluencia', 'lleno', 'Ciudad inválida')$q$, 'city_key inválida se rechaza');

-- ------------------------------------------------------------ inmutabilidad
select pg_temp.fails($q$update public.pulse_signals set title = 'Cambiado después'$q$, 'un reporte no se puede editar (sin permiso de UPDATE)');

-- ------------------------------------------------------------ independencia de contribuyentes
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict)
  select id, 'a1000000-0000-0000-0000-000000000001', 'confirma' from public.pulse_signals$q$, 'nadie puede confirmar su propio reporte');
select pg_temp.check((select independent_count = 1 and state = 'por_confirmar' from public.pulse_signals_public), 'un reporte sin confirmar queda «por confirmar» con 1 contribuyente');

select pg_temp.as_user('b2000000-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from public.pulse_signals) = 0, 'B no ve la tabla base de A');
select pg_temp.check((select count(*) from public.pulse_signals_public) = 1, 'B sí ve el reporte por la vista pública');
select pg_temp.fails('select user_id from public.pulse_signals_public', 'la vista pública no expone user_id');
select pg_temp.check((select not is_mine from public.pulse_signals_public), 'is_mine es falso para quien no lo escribió');
insert into public.pulse_confirmations (signal_id, user_id, verdict) select id, 'b2000000-0000-0000-0000-000000000002', 'confirma' from public.pulse_signals_public;
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict)
  select id, 'b2000000-0000-0000-0000-000000000002', 'confirma' from public.pulse_signals_public$q$, 'confirmar dos veces no suma: una persona, un voto');
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict)
  select id, 'c3000000-0000-0000-0000-000000000003', 'confirma' from public.pulse_signals_public$q$, 'B no puede confirmar a nombre de C');
select pg_temp.check((select independent_count = 2 and state = 'por_confirmar' from public.pulse_signals_public), 'con 2 contribuyentes sigue «por confirmar»');

select pg_temp.as_user('c3000000-0000-0000-0000-000000000003');
insert into public.pulse_confirmations (signal_id, user_id, verdict) select id, 'c3000000-0000-0000-0000-000000000003', 'confirma' from public.pulse_signals_public;
select pg_temp.check((select independent_count = 3 and state = 'corroborada' from public.pulse_signals_public), 'con 3 contribuyentes distintos queda «corroborada»');

-- ------------------------------------------------------------ disputa
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
insert into public.pulse_signals (user_id, city_key, category, kind, title) values ('a1000000-0000-0000-0000-000000000001', 'sao-paulo-br', 'afluencia', 'lleno', 'Parque lleno');
select pg_temp.as_user('d4000000-0000-0000-0000-000000000004');
insert into public.pulse_confirmations (signal_id, user_id, verdict) select id, 'd4000000-0000-0000-0000-000000000004', 'contradice' from public.pulse_signals_public where city_key = 'sao-paulo-br';
select pg_temp.as_user('e5000000-0000-0000-0000-000000000005');
insert into public.pulse_confirmations (signal_id, user_id, verdict) select id, 'e5000000-0000-0000-0000-000000000005', 'contradice' from public.pulse_signals_public where city_key = 'sao-paulo-br';
select pg_temp.check((select state = 'en_disputa' and contradicted_count = 2 from public.pulse_signals_public where city_key = 'sao-paulo-br'), 'dos personas que contradicen la ponen «en disputa»');

-- ------------------------------------------------------------ anónimo
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.pulse_signals_public) = 2, 'un visitante sin sesión puede leer los reportes vigentes');
select pg_temp.fails('select * from public.pulse_signals', 'anon no puede leer la tabla base');
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('a1000000-0000-0000-0000-000000000001', 'valparaiso-cl', 'afluencia', 'lleno', 'Anónimo')$q$, 'anon no puede reportar');
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict) select id, 'a1000000-0000-0000-0000-000000000001', 'confirma' from public.pulse_signals_public$q$, 'anon no puede confirmar');

-- ------------------------------------------------------------ caducidad
select pg_temp.as_admin();
insert into public.pulse_signals (user_id, city_key, category, kind, title, created_at, observed_at)
  values ('a1000000-0000-0000-0000-000000000001', 'santiago-cl', 'afluencia', 'lleno', 'De ayer, ya caducó', now() - interval '2 days', now() - interval '2 days');
select set_config('t.expired_id', (select id::text from public.pulse_signals where city_key = 'santiago-cl'), false);
select pg_temp.check((select count(*) from public.pulse_signals where city_key = 'santiago-cl') = 1, 'el reporte caducado SÍ existe en la tabla base');
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.pulse_signals_public where city_key = 'santiago-cl') = 0, 'un reporte caducado desaparece de la vista pública');
select pg_temp.as_user('b2000000-0000-0000-0000-000000000002');
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict)
  values (current_setting('t.expired_id')::uuid, 'b2000000-0000-0000-0000-000000000002', 'confirma')$q$, 'no se puede confirmar un reporte caducado');

-- ------------------------------------------------------------ privacidad de quién confirmó
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.pulse_confirmations) = 0, 'el autor no puede ver quién confirmó su reporte');
select pg_temp.check((select count(*) from public.pulse_signals_public where is_mine) >= 1, 'is_mine es verdadero para el autor');

-- ------------------------------------------------------------ marcas de la comunidad
select pg_temp.as_user('b2000000-0000-0000-0000-000000000002');
insert into public.pulse_flags (signal_id, user_id, reason) select id, 'b2000000-0000-0000-0000-000000000002', 'falso' from public.pulse_signals_public where city_key = 'sao-paulo-br';
select pg_temp.fails($q$insert into public.pulse_flags (signal_id, user_id, reason)
  select id, 'b2000000-0000-0000-0000-000000000002', 'spam' from public.pulse_signals_public where city_key = 'sao-paulo-br'$q$, 'una persona no puede marcar dos veces el mismo reporte');
select pg_temp.as_user('c3000000-0000-0000-0000-000000000003');
insert into public.pulse_flags (signal_id, user_id, reason) select id, 'c3000000-0000-0000-0000-000000000003', 'falso' from public.pulse_signals_public where city_key = 'sao-paulo-br';
select pg_temp.check((select count(*) from public.pulse_signals_public where city_key = 'sao-paulo-br') = 1, 'con 2 marcas el reporte sigue visible');
select pg_temp.as_user('d4000000-0000-0000-0000-000000000004');
insert into public.pulse_flags (signal_id, user_id, reason) select id, 'd4000000-0000-0000-0000-000000000004', 'falso' from public.pulse_signals_public where city_key = 'sao-paulo-br';
select pg_temp.check((select count(*) from public.pulse_signals_public where city_key = 'sao-paulo-br') = 0, 'con 3 marcas de personas distintas el reporte se oculta');
select pg_temp.fails($q$update public.pulse_signals set hidden = false$q$, 'nadie puede des-ocultar un reporte');
select pg_temp.as_admin();
select set_config('t.hidden_id', (select id::text from public.pulse_signals where city_key = 'sao-paulo-br'), false);
select pg_temp.as_user('e5000000-0000-0000-0000-000000000005');
select pg_temp.fails($q$insert into public.pulse_confirmations (signal_id, user_id, verdict)
  values (current_setting('t.hidden_id')::uuid, 'e5000000-0000-0000-0000-000000000005', 'confirma')$q$, 'no se puede confirmar un reporte oculto por la comunidad');

-- ------------------------------------------------------------ límite diario
select pg_temp.as_user('e5000000-0000-0000-0000-000000000005');
insert into public.pulse_signals (user_id, city_key, category, kind, title)
  select 'e5000000-0000-0000-0000-000000000005', 'santiago-cl', 'afluencia', 'lleno', 'Reporte ' || g from generate_series(1, 20) g;
select pg_temp.fails($q$insert into public.pulse_signals (user_id, city_key, category, kind, title)
  values ('e5000000-0000-0000-0000-000000000005', 'santiago-cl', 'afluencia', 'lleno', 'El número 21')$q$, 'el reporte 21 del día supera el límite');

-- ------------------------------------------------------------ derecho a borrar lo propio
select pg_temp.as_user('b2000000-0000-0000-0000-000000000002');
select public.delete_my_cloud_data();
select pg_temp.check((select count(*) from public.pulse_confirmations) = 0 and (select count(*) from public.pulse_flags) = 0, 'B borra sus confirmaciones y marcas');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from public.pulse_signals) >= 1, 'borrar lo de B no toca los reportes de A');
select public.delete_my_cloud_data();
select pg_temp.check((select count(*) from public.pulse_signals) = 0, 'A borra todos sus reportes');
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.pulse_signals_public where city_key in ('valparaiso-cl', 'sao-paulo-br')) = 0, 'los reportes borrados desaparecen de la vista pública');
select pg_temp.as_admin();
\echo PULSEMESH OK
