#!/usr/bin/env bash
# Prueba las políticas RLS de supabase/migrations contra un Postgres temporal (sin PostGIS).
# Requiere los binarios de PostgreSQL 16 y poder ejecutarlos como el usuario `postgres`.
# Uso: bash supabase/tests/rls.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../migrations"
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
chown postgres "$DIR"; chmod 755 "$HERE" "$HERE/.." 2>/dev/null || true
run() { su postgres -s /bin/bash -c "$*"; }
trap 'run "$BIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

run "$BIN/initdb -D $DIR/data -A trust" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start" >/dev/null
P="$BIN/psql -X -q -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1"

run "$P -d postgres -c 'create database t'"
run "$P -d t" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL

# 0001 real, sin lo que exige PostGIS (extensión, columna geográfica e índice espacial).
python3 - "$MIG/0001_init.sql" > "$DIR/0001.sql" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
n0 = len(s)
s = re.sub(r"create extension if not exists postgis[^;]*;", "", s)
s = re.sub(r"geog\s+extensions\.geography\(Point, 4326\)\s+generated always as \(.*?\) stored,", "", s, flags=re.S)
s = re.sub(r"create index destinations_geog_idx[^;]*;", "", s)
if len(s) == n0 or "geography" in s:
    sys.exit("No se pudo adaptar 0001 para PostgreSQL sin PostGIS")
print(s)
PY
chmod 644 "$DIR/0001.sql"; cp "$MIG/0004_user_cloud_data.sql" "$DIR/0004.sql"; chmod 644 "$DIR/0004.sql"
run "$P -d t -f $DIR/0001.sql" >/dev/null
run "$P -d t -f $DIR/0004.sql" >/dev/null
echo "Migraciones 0001 y 0004 aplicadas."
cp "$HERE/rls.sql" "$DIR/rls.sql"; chmod 644 "$DIR/rls.sql"
run "$P -d t -f $DIR/rls.sql" 2>&1

# El seed generado (datos reales + ausencias declaradas) debe cargarse sin errores y sin precios inventados.
cp "$HERE/../seed.sql" "$DIR/seed.sql"; chmod 644 "$DIR/seed.sql"
run "$P -d t -f $DIR/seed.sql" >/dev/null
run "$P -d t -At -c \"select 'seed: ' || (select count(*) from public.destinations) || ' destinos, ' || (select count(*) from public.destination_monthly) || ' meses, ' || (select count(*) from public.price_snapshots) || ' precios, ' || (select count(*) from public.destination_monthly where season is not null or saturation is not null or daily_cost_usd is not null) || ' filas con datos no reales'\""
