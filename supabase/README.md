# Supabase — Travel Pulse V1

Esquema Postgres + PostGIS para las tablas de Fase 1 (documento maestro, secciones 8 y 10).

## Archivos

| Archivo | Contenido |
|---|---|
| `migrations/0001_init.sql` | Extensiones, tablas, índices, triggers y políticas RLS |
| `migrations/0002_gap_view.sql` | Expectation Gap agregado: vista interna y funciones públicas (solo n ≥ 10) |
| `seed.sql` | Datos curados V1 (30 destinos), **generado**; no editar a mano |
| `gen-seed.mjs` | Generador de `seed.sql` desde `src/lib/data/seed` |

## Aplicar migraciones

Con la CLI de Supabase (proyecto enlazado):

```bash
supabase link --project-ref <ref>
supabase db push            # aplica migrations/*.sql en orden
psql "$DATABASE_URL" -f supabase/seed.sql
```

En local: `supabase start` y luego `supabase db reset` (aplica migraciones y ejecuta `seed.sql`).

Sin CLI: ejecutar en el editor SQL del panel, en orden, `0001_init.sql`, `0002_gap_view.sql` y `seed.sql`.

## Regenerar el seed

El dataset fuente está en TypeScript (`src/lib/data/seed/table.ts`). Después de editarlo:

```bash
npx vitest run src/lib/data    # valida rangos, 12 meses, fuentes, similares
node supabase/gen-seed.mjs     # escribe supabase/seed.sql
```

El generador usa `esbuild` (ya instalado como dependencia de vitest); no requiere `tsx`.
`seed.sql` es idempotente: hace upsert de fuentes y destinos y reemplaza las tablas mensuales, de precios, conectividad y tendencias.

## Variables de entorno (solo servidor, nunca en el cliente)

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service role; la usan solo las rutas de API |
| `IP_HASH_SALT` | Sal para `sha256(sal:ip)`; la IP nunca se guarda en claro |

Si faltan `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`, `getRepository()` usa el repositorio en memoria con el dataset curado (modo demo).
No usar prefijo `NEXT_PUBLIC_` para ninguna de estas variables.

## Resumen de RLS

RLS está activado en **todas** las tablas.

| Tabla | anon | authenticated | service role |
|---|---|---|---|
| `sources`, `destinations`, `destination_connectivity`, `destination_monthly`, `price_snapshots`, `destination_trends` | Leer | Leer | Todo |
| `profiles` | — | Leer y editar su perfil (`display_name`, `origin`, `language`); no puede cambiar `role` | Todo |
| `trip_requests` | — | Leer, crear y borrar las propias | Todo |
| `recommendations` | — | Leer las de sus consultas | Todo (escribe el servidor) |
| `saved_destinations` | — | Leer, crear y borrar los propios | Todo |
| `outbound_clicks` | — | Leer los propios | Todo (registra el servidor, con hash de IP) |
| `expectations`, `experiences`, `during_signals` | — | Leer, crear y borrar las propias | Todo |
| `events` | — | — | Todo |

- Toda condición de propiedad es `auth.uid() = user_id`: **ninguna tabla de usuario es legible por otro usuario**.
- Las consultas y el feedback anónimos (`anon_id`) se insertan solo desde las rutas de API con service role; el rol `anon` no tiene privilegios sobre tablas de usuario.
- Los catálogos solo se escriben con service role.
- El gap por destino se expone con `get_destination_gap(id)` y `list_destination_gaps()` (security definer), que devuelven solo agregados con n ≥ 10. La vista `destination_gap_stats` (incluye n < 10) es solo para service role.
- Al registrarse un usuario, el trigger `on_auth_user_created` crea su fila en `profiles` con rol `user`.

## Notas de modelo

- `destinations.geog` es `geography(Point, 4326)` generada desde `lat`/`lon` (índice GiST).
- `price_snapshots` guarda historial; el repositorio usa la observación más reciente por (destino, origen, mes).
- Cada dato con procedencia guarda su `*_source_id` y `*_observed_at`, que el motor usa para calcular la calidad q_i.
- `destination_connectivity` y `destination_trends` no aparecen en la tabla de la sección 8, pero hacen falta para `Destination.connectivity` y `Trend`.
