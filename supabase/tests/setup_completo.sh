#!/usr/bin/env bash
# Aplica supabase/setup-completo.sql (las 6 migraciones juntas) en un Postgres limpio y comprueba el resultado.
# Requiere los binarios de PostgreSQL 16 y poder ejecutarlos como el usuario `postgres`.
# Uso: bash supabase/tests/setup_completo.sh
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

# Misma adaptación que rls.sh: este Postgres de prueba no trae PostGIS (Supabase sí).
python3 - "$HERE/../setup-completo.sql" > "$DIR/setup.sql" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read(); n0 = len(s)
s = re.sub(r"create extension if not exists postgis[^;]*;", "", s)
s = re.sub(r"geog\s+extensions\.geography\(Point, 4326\)\s+generated always as \(.*?\) stored,", "", s, flags=re.S)
s = re.sub(r"create index destinations_geog_idx[^;]*;", "", s)
if len(s) == n0 or "geography" in s: sys.exit("No se pudo adaptar setup-completo.sql para PostgreSQL sin PostGIS")
print(s)
PY
chmod 644 "$DIR/setup.sql"
run "$P -d t -f $DIR/setup.sql" >/dev/null
echo "setup-completo.sql: aplicado completo en una base limpia."
run "$P -d t -At -c \"select 'objetos: ' || (select count(*) from pg_tables where schemaname='public') || ' tablas, ' || (select count(*) from pg_views where schemaname='public') || ' vistas, ' || (select count(*) from pg_policies where schemaname='public') || ' políticas'\""
run "$P -d t -At -c \"select 'RLS activo en todas las tablas: ' || (select bool_and(rowsecurity) from pg_tables where schemaname='public' and tablename in ('profiles','user_trips','pulse_signals','pulse_confirmations','pulse_flags'))\""
# Segunda ejecución: informa qué pasa (no es obligatorio que sea repetible).
if run "$P -d t -f $DIR/setup.sql" >/dev/null 2>"$DIR/err.txt"; then echo "SEGUNDA ejecución: sin errores (repetible)."; else echo "SEGUNDA ejecución: FALLA (no repetible): $(head -c 160 "$DIR/err.txt" | tr '\n' ' ')"; fi
