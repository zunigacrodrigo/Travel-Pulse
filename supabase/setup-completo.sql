-- Travel Pulse · instalación completa en Supabase (migraciones 0001–0006).
-- GENERADO por scripts/build-setup-sql.mjs: no lo edites; cambia las migraciones y vuelve a generarlo (npm run nube:sql).
-- Pégalo ENTERO en Supabase → SQL Editor → New query → Run, UNA sola vez y en un proyecto nuevo (verificado en un Postgres limpio).
-- NO es repetible: una segunda ejecución falla con «relation already exists». Si algo sale mal, corre «npm run preflight» para ver qué quedó aplicado.

-- ===================== 0001_init.sql =====================
-- Travel Pulse V1 — esquema inicial (documento maestro, secciones 8 y 10).
-- Postgres + PostGIS en Supabase. Tablas de Fase 1 únicamente.
--
-- Reglas de acceso:
--   * Datos de referencia (sources, destinations, destination_connectivity,
--     destination_monthly, price_snapshots, destination_trends): lectura pública,
--     escritura solo con service role (que omite RLS).
--   * Tablas de usuario: cada usuario autenticado lee y escribe solo sus filas
--     (auth.uid() = user_id). Las consultas anónimas (anon_id) se insertan desde
--     las rutas de API con service role; el rol `anon` no tiene acceso a ellas.
--   * events: sin políticas => solo service role.
--   * Ninguna tabla de usuario es legible por otro usuario.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

/* ------------------------------------------------------------------ */
/* Referencia                                                          */
/* ------------------------------------------------------------------ */

create table public.sources (
  id            text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name          text not null check (length(name) between 1 and 120),
  license       text not null check (length(license) between 1 and 80),
  max_age_days  integer not null check (max_age_days > 0),
  reliability   numeric(3, 2) not null check (reliability between 0 and 1),
  url           text check (url is null or url ~ '^https://'),
  created_at    timestamptz not null default now()
);

create table public.destinations (
  id                text primary key check (id ~ '^[A-Z]{3}$'),
  name              text not null check (length(name) between 1 and 80),
  country           text not null check (length(country) between 1 and 80),
  lat               double precision not null check (lat between -90 and 90),
  lon               double precision not null check (lon between -180 and 180),
  geog              extensions.geography(Point, 4326)
                      generated always as (
                        extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
                      ) stored,
  altitude_m        integer not null check (altitude_m between -500 and 6000),
  -- Afinidad 0..5 por interés: {"aventura":5,"comida":4,...}
  tags              jsonb not null check (jsonb_typeof(tags) = 'object'),
  risk_level        smallint check (risk_level between 1 and 4),
  risk_source_id    text not null references public.sources (id),
  risk_observed_at  date not null,
  risk_reasons      text[] not null default '{}',
  similar_ids       text[] not null default '{}',
  blurb             text not null check (length(blurb) <= 200),
  poster            jsonb not null check (jsonb_typeof(poster) = 'object'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index destinations_geog_idx on public.destinations using gist (geog);

-- Conectividad por origen (Destination.connectivity).
create table public.destination_connectivity (
  destination_id    text not null references public.destinations (id) on delete cascade,
  origin            text not null check (origin ~ '^[A-Z]{3}$'),
  direct_flights    boolean not null,
  flight_hours      numeric(4, 1) not null check (flight_hours > 0 and flight_hours < 40),
  weekly_frequency  integer not null check (weekly_frequency >= 0),
  source_id         text not null references public.sources (id),
  observed_at       date not null,
  primary key (destination_id, origin)
);
create index destination_connectivity_origin_idx on public.destination_connectivity (origin);

create table public.destination_monthly (
  destination_id          text not null references public.destinations (id) on delete cascade,
  month                   smallint not null check (month between 1 and 12),
  season                  smallint check (season between 0 and 100),
  season_source_id        text not null references public.sources (id),
  season_observed_at      date not null,
  -- 0..100, más alto = MENOS saturado. null = sin dato.
  saturation              smallint check (saturation between 0 and 100),
  saturation_source_id    text not null references public.sources (id),
  saturation_observed_at  date not null,
  daily_cost_usd          numeric(8, 2) check (daily_cost_usd >= 0),
  daily_cost_source_id    text not null references public.sources (id),
  daily_cost_observed_at  date not null,
  temp_c                  numeric(4, 1) check (temp_c between -60 and 60),
  rain_mm                 numeric(6, 1) check (rain_mm >= 0),
  wind_kmh                numeric(5, 1) check (wind_kmh >= 0),
  climate_source_id       text not null references public.sources (id),
  climate_observed_at     date not null,
  primary key (destination_id, month),
  -- El clima es un bloque: todo o nada.
  check ((temp_c is null) = (rain_mm is null) and (rain_mm is null) = (wind_kmh is null))
);
create index destination_monthly_month_idx on public.destination_monthly (month);

-- Historial de precios observados. El repositorio usa la observación más reciente
-- por (destino, origen, mes).
create table public.price_snapshots (
  id                  bigint generated always as identity primary key,
  destination_id      text not null references public.destinations (id) on delete cascade,
  origin              text not null check (origin ~ '^[A-Z]{3}$'),
  month               smallint not null check (month between 1 and 12),
  flight_usd          numeric(10, 2) check (flight_usd > 0),
  flight_source_id    text not null references public.sources (id),
  flight_observed_at  date not null,
  usual_flight_usd    numeric(10, 2) check (usual_flight_usd > 0),
  usual_source_id     text not null references public.sources (id),
  usual_observed_at   date not null,
  created_at          timestamptz not null default now()
);
create index price_snapshots_lookup_idx
  on public.price_snapshots (origin, month, destination_id, flight_observed_at desc);
create index price_snapshots_destination_idx on public.price_snapshots (destination_id);

-- Tendencia vigente por destino (Trend). Se sobrescribe con upsert.
create table public.destination_trends (
  destination_id            text primary key references public.destinations (id) on delete cascade,
  price_change_30d_pct      numeric(6, 2),
  price_source_id           text not null references public.sources (id),
  price_observed_at         date not null,
  interest_change_30d_pct   numeric(6, 2),
  interest_source_id        text not null references public.sources (id),
  interest_observed_at      date not null,
  updated_at                timestamptz not null default now()
);

/* ------------------------------------------------------------------ */
/* Usuario                                                             */
/* ------------------------------------------------------------------ */

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or length(display_name) <= 80),
  origin        text not null default 'SCL' check (origin ~ '^[A-Z]{3}$'),
  language      text not null default 'es' check (language in ('es', 'en', 'pt')),
  role          text not null default 'user' check (role in ('user', 'founding_explorer', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.trip_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  anon_id         text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  origin          text not null check (origin ~ '^[A-Z]{3}$'),
  budget_usd      numeric(10, 2) not null check (budget_usd > 0 and budget_usd <= 1000000),
  days            smallint not null check (days between 1 and 90),
  month           smallint not null check (month between 1 and 12),
  flexible_dates  boolean not null default false,
  travelers       smallint not null check (travelers between 1 and 20),
  interests       text[] not null default '{}' check (
                    interests <@ array['aventura','comida','cultura','naturaleza','playa','romance','desconocido','lujo']::text[]
                  ),
  created_at      timestamptz not null default now()
);
create index trip_requests_user_idx on public.trip_requests (user_id, created_at desc) where user_id is not null;
create index trip_requests_created_idx on public.trip_requests (created_at desc);

create table public.recommendations (
  id                bigint generated always as identity primary key,
  trip_request_id   uuid not null references public.trip_requests (id) on delete cascade,
  destination_id    text not null references public.destinations (id),
  rank              smallint not null check (rank >= 1),
  score             numeric(5, 2) check (score between 0 and 100),
  raw_score         numeric(5, 2) not null check (raw_score between 0 and 100),
  confidence        numeric(5, 2) not null check (confidence between 0 and 100),
  confidence_band   text not null check (confidence_band in ('limited', 'warning', 'normal')),
  opportunity       boolean not null default false,
  total_usd         numeric(10, 2) check (total_usd >= 0),
  -- ScoreResult completo: factores, pesos, calidad, costos, razón.
  breakdown         jsonb not null,
  engine_version    text not null check (length(engine_version) between 1 and 20),
  created_at        timestamptz not null default now(),
  unique (trip_request_id, destination_id)
);
create index recommendations_destination_idx on public.recommendations (destination_id, created_at desc);
create index recommendations_engine_idx on public.recommendations (engine_version);

create table public.saved_destinations (
  user_id         uuid not null references auth.users (id) on delete cascade,
  destination_id  text not null references public.destinations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, destination_id)
);

create table public.outbound_clicks (
  id               bigint generated always as identity primary key,
  user_id          uuid references auth.users (id) on delete cascade,
  anon_id          text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  trip_request_id  uuid references public.trip_requests (id) on delete set null,
  destination_id   text not null references public.destinations (id),
  kind             text not null check (kind ~ '^[a-z_]{1,32}$'),
  url              text not null check (url ~ '^https://' and length(url) <= 2048),
  -- sha256(ip + sal) en hex; la IP nunca se guarda en claro.
  ip_hash          text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz not null default now()
);
create index outbound_clicks_destination_idx on public.outbound_clicks (destination_id, created_at desc);
create index outbound_clicks_user_idx on public.outbound_clicks (user_id) where user_id is not null;
create index outbound_clicks_request_idx on public.outbound_clicks (trip_request_id) where trip_request_id is not null;

-- Expectativa previa (GapRatings 1..10 por criterio).
create table public.expectations (
  id              bigint generated always as identity primary key,
  user_id         uuid references auth.users (id) on delete cascade,
  anon_id         text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  destination_id  text not null references public.destinations (id),
  autenticidad    smallint not null check (autenticidad between 1 and 10),
  saturacion      smallint not null check (saturacion between 1 and 10),
  costo           smallint not null check (costo between 1 and 10),
  seguridad       smallint not null check (seguridad between 1 and 10),
  comida          smallint not null check (comida between 1 and 10),
  created_at      timestamptz not null default now(),
  check (user_id is not null or anon_id is not null)
);
create index expectations_destination_idx on public.expectations (destination_id);
create index expectations_user_idx on public.expectations (user_id) where user_id is not null;

-- Realidad posterior. `gap` = media(r - e) cuando hay expectativa asociada.
create table public.experiences (
  id                     bigint generated always as identity primary key,
  user_id                uuid references auth.users (id) on delete cascade,
  anon_id                text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  destination_id         text not null references public.destinations (id),
  autenticidad           smallint not null check (autenticidad between 1 and 10),
  saturacion             smallint not null check (saturacion between 1 and 10),
  costo                  smallint not null check (costo between 1 and 10),
  seguridad              smallint not null check (seguridad between 1 and 10),
  comida                 smallint not null check (comida between 1 and 10),
  expected_autenticidad  smallint check (expected_autenticidad between 1 and 10),
  expected_saturacion    smallint check (expected_saturacion between 1 and 10),
  expected_costo         smallint check (expected_costo between 1 and 10),
  expected_seguridad     smallint check (expected_seguridad between 1 and 10),
  expected_comida        smallint check (expected_comida between 1 and 10),
  phrase                 text check (phrase is null or length(phrase) <= 280),
  gap                    numeric(4, 2) check (gap between -9 and 9),
  created_at             timestamptz not null default now(),
  check (user_id is not null or anon_id is not null)
);
create index experiences_destination_idx on public.experiences (destination_id) where gap is not null;
create index experiences_user_idx on public.experiences (user_id) where user_id is not null;

create table public.during_signals (
  id              bigint generated always as identity primary key,
  user_id         uuid references auth.users (id) on delete cascade,
  anon_id         text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  destination_id  text not null references public.destinations (id),
  ambiente        text not null check (ambiente in ('tranquilo', 'animado', 'tenso')),
  afluencia       text not null check (afluencia in ('vacio', 'normal', 'lleno')),
  precio          text not null check (precio in ('barato', 'normal', 'caro')),
  created_at      timestamptz not null default now(),
  check (user_id is not null or anon_id is not null)
);
create index during_signals_destination_idx on public.during_signals (destination_id, created_at desc);
create index during_signals_user_idx on public.during_signals (user_id) where user_id is not null;

create table public.events (
  id          bigint generated always as identity primary key,
  name        text not null check (name ~ '^[a-z0-9_.:-]{1,64}$'),
  props       jsonb not null default '{}' check (jsonb_typeof(props) = 'object'),
  user_id     uuid references auth.users (id) on delete set null,
  anon_id     text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  created_at  timestamptz not null default now()
);
create index events_name_created_idx on public.events (name, created_at desc);

/* ------------------------------------------------------------------ */
/* Perfil automático al registrarse                                    */
/* ------------------------------------------------------------------ */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger destinations_touch before update on public.destinations
  for each row execute function public.touch_updated_at();

/* ------------------------------------------------------------------ */
/* Row Level Security                                                  */
/* ------------------------------------------------------------------ */

alter table public.sources                  enable row level security;
alter table public.destinations             enable row level security;
alter table public.destination_connectivity enable row level security;
alter table public.destination_monthly      enable row level security;
alter table public.price_snapshots          enable row level security;
alter table public.destination_trends       enable row level security;
alter table public.profiles                 enable row level security;
alter table public.trip_requests            enable row level security;
alter table public.recommendations          enable row level security;
alter table public.saved_destinations       enable row level security;
alter table public.outbound_clicks          enable row level security;
alter table public.expectations             enable row level security;
alter table public.experiences              enable row level security;
alter table public.during_signals           enable row level security;
alter table public.events                   enable row level security;

-- Referencia: lectura pública; sin políticas de escritura (solo service role).
create policy "lectura publica" on public.sources                  for select to anon, authenticated using (true);
create policy "lectura publica" on public.destinations             for select to anon, authenticated using (true);
create policy "lectura publica" on public.destination_connectivity for select to anon, authenticated using (true);
create policy "lectura publica" on public.destination_monthly      for select to anon, authenticated using (true);
create policy "lectura publica" on public.price_snapshots          for select to anon, authenticated using (true);
create policy "lectura publica" on public.destination_trends       for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on
  public.sources, public.destinations, public.destination_connectivity,
  public.destination_monthly, public.price_snapshots, public.destination_trends
  from anon, authenticated;

-- Tablas de usuario: el rol anon no tiene ningún privilegio.
revoke all on
  public.profiles, public.trip_requests, public.recommendations, public.saved_destinations,
  public.outbound_clicks, public.expectations, public.experiences, public.during_signals,
  public.events
  from anon;

-- events: ni anon ni authenticated; solo service role.
revoke all on public.events from authenticated;

-- profiles: el usuario lee y edita su perfil, pero no puede cambiar su rol.
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, origin, language) on public.profiles to authenticated;
create policy "perfil propio: leer" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "perfil propio: editar" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- trip_requests
create policy "propias: leer" on public.trip_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "propias: crear" on public.trip_requests
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "propias: borrar" on public.trip_requests
  for delete to authenticated using ((select auth.uid()) = user_id);

-- recommendations: legibles solo por el dueño de la consulta; las escribe el servidor.
revoke insert, update, delete on public.recommendations from authenticated;
create policy "de mis consultas: leer" on public.recommendations
  for select to authenticated using (
    exists (
      select 1 from public.trip_requests tr
      where tr.id = trip_request_id and tr.user_id = (select auth.uid())
    )
  );

-- saved_destinations
create policy "propios: leer" on public.saved_destinations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "propios: crear" on public.saved_destinations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "propios: borrar" on public.saved_destinations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- outbound_clicks: el registro lo hace el servidor (hash de IP); el usuario solo lee los suyos.
revoke insert, update, delete on public.outbound_clicks from authenticated;
create policy "propios: leer" on public.outbound_clicks
  for select to authenticated using ((select auth.uid()) = user_id);

-- expectations, experiences, during_signals: el usuario gestiona solo sus filas.
create policy "propias: leer" on public.expectations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "propias: crear" on public.expectations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "propias: borrar" on public.expectations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "propias: leer" on public.experiences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "propias: crear" on public.experiences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "propias: borrar" on public.experiences
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "propias: leer" on public.during_signals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "propias: crear" on public.during_signals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "propias: borrar" on public.during_signals
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke update on public.trip_requests, public.expectations, public.experiences, public.during_signals
  from authenticated;

-- ===================== 0002_gap_view.sql =====================
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

-- ===================== 0003_mark_seed_prices_as_estimates.sql =====================
-- Los precios del dataset local se calculan desde una tabla sintética; no provienen
-- de una cotización de Amadeus. Reducir su frescura y fiabilidad para el motor.
begin;

insert into public.sources (id, name, license, max_age_days, reliability, url)
values (
  'estimacion-tp',
  'Estimación experimental Travel Pulse',
  'Dataset sintético interno',
  1,
  0.25,
  null
)
on conflict (id) do update set
  name = excluded.name,
  license = excluded.license,
  max_age_days = excluded.max_age_days,
  reliability = excluded.reliability,
  url = excluded.url;

update public.price_snapshots
set flight_source_id = 'estimacion-tp',
    usual_source_id = 'estimacion-tp';

update public.destination_trends
set price_source_id = 'estimacion-tp';

commit;

-- ===================== 0004_user_cloud_data.sql =====================
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

-- ===================== 0005_pulsemesh.sql =====================
-- Travel Pulse 0.6 — PulseMesh: viajeros como sensores del mundo real.
--
-- Principios (no negociables):
--   * Voluntario y sin vigilancia: no hay seguimiento. La ubicación se guarda con 2 decimales
--     (~1 km) y la base de datos la redondea, aunque el cliente envíe más precisión.
--   * La identidad nunca sale: la lectura pública pasa por una vista sin `user_id`.
--   * Una persona = un voto: nadie confirma su propio reporte ni confirma dos veces.
--     Las confirmaciones se cuentan como CONTRIBUYENTES DISTINTOS, no como clics.
--   * Los reportes son inmutables (no se editan: evita cambiar el sentido tras las confirmaciones)
--     y caducan solos, con una vigencia que fija el servidor según la categoría.
--   * Nunca se presentan como información oficial; el contraste con fuentes oficiales lo hace la app.
--   * Límites diarios y de tamaño contra abuso; la comunidad puede marcar reportes (3 marcas distintas lo ocultan).
--   * Categorías del piloto: condiciones, precios, afluencia, descubrimientos. Seguridad queda fuera
--     hasta contar con moderación.
--   * El usuario borra todo lo suyo con `delete_my_cloud_data()`.

/* ------------------------------------------------------------------ */
/* Reportes                                                            */
/* ------------------------------------------------------------------ */

create table if not exists public.pulse_signals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  city_key    text not null check (city_key ~ '^[a-z0-9-]{2,60}$'),
  category    text not null check (category in ('condiciones', 'precios', 'afluencia', 'descubrimientos')),
  kind        text not null check (kind ~ '^[a-z_]{2,32}$'),
  title       text not null check (char_length(title) between 3 and 120),
  detail      text check (detail is null or char_length(detail) <= 500),
  price_amount   numeric(12, 2) check (price_amount is null or price_amount >= 0),
  price_currency text check (price_currency is null or price_currency ~ '^[A-Z]{3}$'),
  -- Ubicación aproximada: 2 decimales (~1 km). El redondeo lo impone el tipo de la columna.
  lat_approx  numeric(5, 2) check (lat_approx is null or lat_approx between -90 and 90),
  lon_approx  numeric(5, 2) check (lon_approx is null or lon_approx between -180 and 180),
  observed_at timestamptz not null default now(),
  -- La fija el servidor (ver trigger); el cliente no la envía.
  expires_at  timestamptz not null,
  -- Moderación: solo las modifican los triggers de marcas y el rol de servicio.
  flags       integer not null default 0 check (flags >= 0),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  check ((price_amount is null) = (price_currency is null)),
  check (category = 'precios' or price_amount is null),
  check ((lat_approx is null) = (lon_approx is null)),
  check (expires_at > observed_at and expires_at <= observed_at + interval '30 days'),
  check (observed_at <= created_at + interval '5 minutes' and observed_at >= created_at - interval '3 days')
);
create index if not exists pulse_signals_city_idx on public.pulse_signals (city_key, expires_at desc);
create index if not exists pulse_signals_user_idx on public.pulse_signals (user_id, created_at desc);

create table if not exists public.pulse_confirmations (
  signal_id  uuid not null references public.pulse_signals (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  verdict    text not null check (verdict in ('confirma', 'contradice')),
  created_at timestamptz not null default now(),
  primary key (signal_id, user_id)
);
create index if not exists pulse_confirmations_user_idx on public.pulse_confirmations (user_id, created_at desc);

create table if not exists public.pulse_flags (
  signal_id  uuid not null references public.pulse_signals (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text not null check (reason in ('falso', 'spam', 'ofensivo', 'privacidad', 'otro')),
  created_at timestamptz not null default now(),
  primary key (signal_id, user_id)
);

/* ------------------------------------------------------------------ */
/* Reglas en el servidor                                               */
/* ------------------------------------------------------------------ */

-- Vigencia por categoría (la condición de una playa caduca antes que un precio) y límite diario.
create or replace function public.pulse_before_signal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ttl interval;
  today integer;
begin
  ttl := case new.category
    when 'afluencia' then interval '6 hours'
    when 'condiciones' then interval '24 hours'
    when 'precios' then interval '14 days'
    else interval '30 days'
  end;
  new.observed_at := coalesce(new.observed_at, now());
  new.expires_at := new.observed_at + ttl;
  select count(*) into today from public.pulse_signals
    where user_id = new.user_id and created_at > now() - interval '1 day';
  if today >= 20 then
    raise exception 'Límite diario de reportes alcanzado' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_signals_before on public.pulse_signals;
create trigger pulse_signals_before before insert on public.pulse_signals
  for each row execute function public.pulse_before_signal();

-- `security definer`: debe ver reportes de otros (que la RLS oculta) solo para validar la regla.
create or replace function public.pulse_before_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  today integer;
begin
  select user_id, expires_at, hidden into s from public.pulse_signals where id = new.signal_id;
  if not found then
    raise exception 'Reporte inexistente' using errcode = 'foreign_key_violation';
  end if;
  if s.user_id = new.user_id then
    raise exception 'No puedes confirmar tu propio reporte' using errcode = 'check_violation';
  end if;
  if s.hidden or s.expires_at <= now() then
    raise exception 'El reporte ya no está vigente' using errcode = 'check_violation';
  end if;
  select count(*) into today from public.pulse_confirmations
    where user_id = new.user_id and created_at > now() - interval '1 day';
  if today >= 100 then
    raise exception 'Límite diario de confirmaciones alcanzado' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_confirmations_before on public.pulse_confirmations;
create trigger pulse_confirmations_before before insert on public.pulse_confirmations
  for each row execute function public.pulse_before_confirmation();

-- Tres marcas de personas distintas ocultan el reporte hasta que lo revise un moderador.
create or replace function public.pulse_after_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pulse_signals
     set flags = flags + 1,
         hidden = hidden or (flags + 1 >= 3)
   where id = new.signal_id;
  return new;
end;
$$;

drop trigger if exists pulse_flags_after on public.pulse_flags;
create trigger pulse_flags_after after insert on public.pulse_flags
  for each row execute function public.pulse_after_flag();

/* ------------------------------------------------------------------ */
/* RLS y permisos                                                      */
/* ------------------------------------------------------------------ */

alter table public.pulse_signals enable row level security;
alter table public.pulse_confirmations enable row level security;
alter table public.pulse_flags enable row level security;

-- Cada tabla base solo muestra lo propio. La lectura comunitaria va por la vista, sin identidades.
drop policy if exists "propios: leer" on public.pulse_signals;
create policy "propios: leer" on public.pulse_signals for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "propios: crear" on public.pulse_signals;
create policy "propios: crear" on public.pulse_signals for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "propios: borrar" on public.pulse_signals;
create policy "propios: borrar" on public.pulse_signals for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "propias: leer" on public.pulse_confirmations;
create policy "propias: leer" on public.pulse_confirmations for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "propias: crear" on public.pulse_confirmations;
create policy "propias: crear" on public.pulse_confirmations for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "propias: borrar" on public.pulse_confirmations;
create policy "propias: borrar" on public.pulse_confirmations for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "propias: leer" on public.pulse_flags;
create policy "propias: leer" on public.pulse_flags for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "propias: crear" on public.pulse_flags;
create policy "propias: crear" on public.pulse_flags for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "propias: borrar" on public.pulse_flags;
create policy "propias: borrar" on public.pulse_flags for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.pulse_signals, public.pulse_confirmations, public.pulse_flags from anon, public;
revoke all on public.pulse_signals, public.pulse_confirmations, public.pulse_flags from authenticated;
-- Sin UPDATE para nadie: los reportes son inmutables. INSERT solo en las columnas que el viajero decide
-- (id, expires_at, flags, hidden y created_at los fija el servidor).
grant select, delete on public.pulse_signals to authenticated;
grant insert (user_id, city_key, category, kind, title, detail, price_amount, price_currency, lat_approx, lon_approx, observed_at)
  on public.pulse_signals to authenticated;
grant select, insert, delete on public.pulse_confirmations to authenticated;
grant select, insert, delete on public.pulse_flags to authenticated;

/* ------------------------------------------------------------------ */
/* Lectura comunitaria: sin identidades                                */
/* ------------------------------------------------------------------ */

-- La vista se ejecuta con los permisos de su dueño (omite la RLS de la tabla base) y NO expone `user_id`.
-- Estados: por_confirmar (1 contribuyente), corroborada (3 o más contribuyentes DISTINTOS),
-- en_disputa (2 o más personas la contradicen y superan a quienes la confirman).
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
  (s.user_id = (select auth.uid())) as is_mine
from public.pulse_signals s
left join public.pulse_confirmations c on c.signal_id = s.id
where s.hidden = false and s.expires_at > now()
group by s.id;

revoke all on public.pulse_signals_public from public;
grant select on public.pulse_signals_public to anon, authenticated;

/* ------------------------------------------------------------------ */
/* Derecho a borrar lo propio (amplía 0004)                            */
/* ------------------------------------------------------------------ */

create or replace function public.delete_my_cloud_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.user_trips where user_id = (select auth.uid());
  delete from public.saved_destinations where user_id = (select auth.uid());
  delete from public.pulse_flags where user_id = (select auth.uid());
  delete from public.pulse_confirmations where user_id = (select auth.uid());
  delete from public.pulse_signals where user_id = (select auth.uid());
  update public.profiles set dna = null, dna_updated_at = null where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_cloud_data() from public, anon;
grant execute on function public.delete_my_cloud_data() to authenticated;

-- ===================== 0006_pulsemesh_places.sql =====================
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
