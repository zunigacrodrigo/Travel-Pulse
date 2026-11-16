# Cuentas y datos en la nube (Supabase + Vercel)

La nube es **opcional**: sin estas variables la app funciona igual y todo queda en el dispositivo.

## Qué hace
Con sesión iniciada (enlace por correo, sin contraseña) se sincronizan **Travel DNA**, **destinos guardados** y el **viaje activo con su historial de deshacer**. Gana siempre la versión más reciente (se compara la fecha que viaja dentro del dato). El itinerario de demostración no se sube. Los guardados fuera del catálogo de 30 destinos se quedan en el dispositivo.

## Pasos (una sola vez)

1. **Proyecto de Supabase.** Crea uno exclusivo para Travel Pulse.
2. **Aplicar el esquema, en orden**, con la CLI (`supabase link --project-ref <ref>` y `supabase db push`) o pegando en el editor SQL:
   `0001_init.sql` → `0002_gap_view.sql` → `0003_mark_seed_prices_as_estimates.sql` → `0004_user_cloud_data.sql` → `0005_pulsemesh.sql` → **`0006_pulsemesh_places.sql`**.
   Luego carga el catálogo: `supabase/seed.sql` (los guardados dependen de que existan los destinos).
3. **Autenticación → Providers → Email:** activa el acceso por enlace mágico.
4. **Autenticación → URL Configuration:** *Site URL* = el dominio de producción; en *Redirect URLs* agrega `https://<tu-dominio>/cuenta` y, para pruebas, `http://localhost:3000/cuenta` y las URLs de previsualización de Vercel.
5. **Variables en Vercel** (Project → Settings → Environment Variables), en Production y Preview:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la clave **anon / publishable** (pública por diseño).
   - Nunca pongas la `service_role` en una variable `NEXT_PUBLIC_`: la app la rechaza, pero no dependas de eso.
   - Estas variables se leen **al compilar**: después de agregarlas, vuelve a desplegar.
6. Deploy. Abre `/cuenta`, pide el enlace con tu correo y comprueba «Sincronizar ahora».

## Seguridad (verificada con `bash supabase/tests/rls.sh`)
24 comprobaciones contra un Postgres real con el esquema `0001` + `0004`, usando dos usuarios:
cada uno solo ve y escribe lo suyo; `anon` no accede a nada; nadie puede ascenderse a `admin`;
límites de 50 viajes y 200 guardados por usuario; tamaños acotados; `delete_my_cloud_data()` borra solo lo propio.

## Lo que NO está verificado
- **No se probó contra un proyecto real de Supabase ni con el envío real de correos.** Las pruebas de navegador usan un servidor simulado con las mismas rutas y formas de respuesta de PostgREST/GoTrue.
- La entrega del correo depende del proveedor de correo de tu proyecto (el integrado de Supabase tiene límites bajos; para producción conviene un SMTP propio).
- Borrar una cuenta de acceso por completo no está en la app: «Borrar mis datos en la nube» elimina los datos, no el inicio de sesión.
- Si quitas un guardado sin red estando con sesión, la nube lo conserva y volverá en la próxima sincronización.

## PulseMesh (viajeros como sensores)
`0005_pulsemesh.sql` crea los reportes de viajeros, sus confirmaciones y las marcas de la comunidad. Piloto: **Santiago, São Paulo y Valparaíso**; categorías **condiciones, precios, afluencia y descubrimientos** (seguridad queda fuera hasta tener moderación).

Reglas que impone la base de datos (66 comprobaciones en `supabase/tests/`, con prueba de mutación):
- La ubicación se guarda con 2 decimales (~1 km) aunque el cliente envíe más precisión.
- La lectura pública pasa por la vista `pulse_signals_public`, **sin identidad del autor**; nadie ve quién confirmó.
- **Una persona, un voto:** no se confirma el propio reporte ni se confirma dos veces. El estado «corroborada» exige 3 contribuyentes distintos; «en disputa», 2 o más que contradicen.
- Los reportes son inmutables y caducan solos (afluencia 6 h, condiciones 24 h, precios 14 días, descubrimientos 30 días); la vigencia la fija el servidor.
- Límites: 20 reportes y 100 confirmaciones por día; 3 marcas de personas distintas ocultan un reporte.
- `delete_my_cloud_data()` también borra los reportes, confirmaciones y marcas de la persona.

**Límite conocido:** la base de datos no puede impedir que una misma persona use varias cuentas. La independencia es por cuenta; la defensa contra cuentas múltiples (verificación, reputación gradual, detección de patrones) está por construir.

### Dónde se usa en la app
Pestaña **Señales** de «Pulso de ciudad» (`/ciudad`). Lectura pública; para **reportar, confirmar, contradecir, marcar o borrar** hace falta iniciar sesión (`/cuenta`). El piloto solo está abierto en Santiago, São Paulo y Valparaíso: en otras ciudades el panel lo dice y no consulta nada.
- Sin Supabase configurado, el panel explica que los reportes compartidos necesitan cuentas.
- La ubicación es opcional, aproximada (~1 km) y **se decide en cada reporte**: la casilla no queda activada.
- Se corrigió la política de permisos del navegador para que la propia app pueda pedir la ubicación (`geolocation=(self)`); cámara y micrófono siguen bloqueados.

## PulseMesh por lugar (0006)

`0006_pulsemesh_places.sql` agrega `place_id` y `place_name` a los reportes, para que una observación («fila larga», «cerrado») se asocie a **un lugar de OpenStreetMap** y pueda afectar al viaje de quien lo tiene en su itinerario.

- `place_id` solo acepta `node/N`, `way/N` o `relation/N` (N de 1 a 15 dígitos): lo impone la base, no el cliente. `place_name` solo existe junto a un `place_id`.
- Los reportes siguen siendo inmutables: nadie puede cambiar el lugar de uno ya publicado.
- La vista pública los expone **sin `user_id`**. El reporte **no envía la ubicación del viajero**: la ubicación es la del lugar.
- Regla de producto: solo un reporte **corroborado por 3 personas distintas** genera un aviso en «Revisar con datos de hoy», y nunca se aplica sin el clic de la persona. Un reporte sin corroborar se muestra pero no mueve el plan.
- Si la nube no está configurada, la pantalla dice «no disponibles en esta instalación»; si la consulta falla, dice que no se pudo consultar. **Nunca** lo presenta como «aún no hay reportes».

**Verificado:** `bash supabase/tests/rls.sh` → 92 comprobaciones (66 de 0001–0005 + 26 de 0006) contra un Postgres 16 real, con 6 mutaciones de la migración detectadas.
**No verificado:** la migración `0006` **no se ha aplicado a un proyecto real de Supabase**; los E2E usan un servidor simulado y los reportes de prueba se declaran como tales. Tampoco hay comunidad real todavía: sin reportes, la función es visible pero vacía.

**Privacidad, a decidir con calma:** un reporte con lugar y hora (`observed_at`) revela que alguien estuvo allí a esa hora. En una comunidad muy pequeña, eso podría permitir adivinar quién reportó. Mientras haya pocos participantes, conviene no mostrar la hora exacta o agrupar la antigüedad. No está resuelto.

## Variables de entorno para el despliegue (Vercel)

| Variable | Para qué | ¿Obligatoria? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase (pública) | Para cuentas y reportes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon/publishable (pública por diseño) | Para cuentas y reportes |
| `ANTHROPIC_API_KEY` | IA (solo en el servidor; nunca `NEXT_PUBLIC_`) | No: sin ella la app funciona con reglas |
| `AI_MONTHLY_BUDGET_USD` | Tope mensual de gasto de IA | Recomendada si hay clave |
| `IP_HASH_SALT` | Sal para el límite de uso por IP | Recomendada |
| `RATE_LIMIT_PER_HOUR` | Límite por hora y por IP | Opcional |

Las variables `NEXT_PUBLIC_*` se leen **al compilar**: tras agregarlas hay que volver a desplegar.

**Riesgos de Vercel que NO verifiqué** (conviene revisarlos antes de lanzar):
- Las cachés, el límite de uso y el control de gasto de IA viven en la memoria de cada instancia: en un entorno sin servidor no se comparten entre instancias.
- «Mi día» hace varias consultas seguidas a Nominatim (1,1 s de espera entre cada una, por su política de uso). Si el plan de Vercel limita la duración de la función, podría agotar el tiempo. No medí ese límite contra tu plan.
- El repositorio trae `railway.json`: un proceso de larga duración conserva las cachés y respeta mejor esos tiempos. Es una alternativa si Vercel se queda corto.
