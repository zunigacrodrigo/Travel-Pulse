# Retomar Travel Pulse en una sesión nueva

Pega esto al empezar una sesión nueva, para no arrastrar la conversación larga (que es lo que más consume):

---

Estoy continuando Travel Pulse. Repositorio: `zunigacrodrigo/travel-pulse`, rama `claude/fase-0-sin-demo` (último commit `632fe06`).

**Lee primero:** `docs/APP_UNICORNIO.md` (visión, bucle, hoja de ruta) y `docs/DIRECTOR_IA.md`.

**Estado:**
- Desplegado en Vercel: https://travel-pulse-three.vercel.app (Supabase conectado; migraciones verificadas con `npm run preflight`; falta cargar `supabase/seed.sql` y configurar redirecciones de autenticación).
- 792 pruebas pasan. E2E: `npm run e2e`.
- Listo en el motor pero **sin conectar a la pantalla**: curador por ánimo del día (`src/lib/day/curate.ts`), interés real por lugar (`interest.ts`), transporte público Transitous (`transit.ts`) y avisos de la calle de OpenStreetMap (`street-notes.ts`). Se activan con el parámetro `mood` en `/api/day-plan` (`src/lib/day/service.ts`).

**Siguiente paso:** conectar esos datos a la pantalla `src/components/day/DayView.tsx` (un selector de ánimo, la razón de cada lugar, cómo llegar en transporte y los avisos), con E2E y captura de Santiago.

**Después:** el rediseño visual de la pantalla, con criterio de producto (un día con forma, tarjetas de lugar con alma).

**Reglas de trabajo:** Sonnet para tareas acotadas; Fable solo para el rediseño visual y avisando el costo antes. Una tarea por vez. Commit y push al terminar cada paso. Nunca pegar claves en el chat.

**Pendiente del usuario:** cargar `supabase/seed.sql` en el SQL Editor; añadir en Supabase las URLs de redirección `https://travel-pulse-three.vercel.app/cuenta`.

---
