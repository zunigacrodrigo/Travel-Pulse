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
