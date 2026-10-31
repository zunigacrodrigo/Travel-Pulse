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
