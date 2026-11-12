# Travel Pulse — Diseño de producto

**«La inteligencia detrás de cada viaje»**

Fecha: 12 de noviembre de 2026 · Base: versión 0.7.0 (commit `7e062d8`) · Autor: diseño de producto y arquitectura (modelo `claude-fable-5-2`).

Este documento define qué construir, en qué orden y cómo se comprueba. No modifica código. Complementa a `docs/MATRIZ_CUMPLIMIENTO.md`, `docs/CATALOGO_FUENTES.md` y `docs/PRD_DIA_EN_LA_CIUDAD.md`.

**Qué verifiqué yo y qué no.** Leí el código citado y ejecuté `npx vitest run` (40 archivos, 471 pruebas, todas pasan). No ejecuté el build, el lint, los E2E ni ninguna llamada a fuentes externas o a la API de Anthropic. Lo que digo sobre el estado de las fuentes proviene de `docs/CATALOGO_FUENTES.md` y de las reglas del dueño. Los términos de uso de terceros que menciono son de memoria y están marcados «por verificar».

---

## 0. Decisiones en una página

| # | Decisión | Por qué |
|---|---|---|
| D1 | El producto es **un solo flujo**: intención → destino → itinerario → modificar o deshacer → adaptar. Todo lo demás es secundario o se elimina. | Es el problema inicial del Maestro (§2). Hoy hay 18 páginas que no forman un flujo. |
| D2 | **Un objeto central: el Viaje.** Un viaje tiene días, cada día tiene paradas y cada dato de una parada es un `Dato` con fuente, fecha y estado. | Hoy hay dos modelos incompatibles (`DayPlan` y `TripPlan`). |
| D3 | **Un solo motor** en `src/lib/plan/`, que fusiona `day/planner.ts`, `trip-twin/engine.ts` y `verify/checks.ts`. | Dos planificadores y un verificador repiten las mismas reglas con resultados distintos. |
| D4 | **Una sola carcasa visual** (`AppShell`): riel lateral en escritorio y barra inferior en móvil, con los mismos cuatro destinos. Se elimina el marco de 430 px. | Hoy conviven cuatro lenguajes visuales. |
| D5 | **La IA es un Director con herramientas.** Interpreta y conversa, pero no escribe horas, minutos ni precios: los pide al motor. Una guardia rechaza toda cifra o lugar que no esté en los resultados de las herramientas. | Regla del dueño y Maestro §13. |
| D6 | **Cualquier ciudad** mediante geocodificación, con un **medidor de cobertura** honesto por ciudad. Se abandona la lista fija de 3 ciudades para el itinerario. | `CITIES` en `src/lib/day/cities.ts` limita el producto a 3 ciudades. |
| D7 | **Sin precios hasta que el dueño elija un proveedor.** La decisión de destino funciona sin puntaje numérico y declara lo que falta. | No hay fuente verificada. |
| D8 | **PulseMesh vive en cada parada**, no en una pestaña aparte. Sin reportes se dice «aún no hay reportes». | Las personas son sensores del lugar concreto. |
| D9 | «Verificar itinerario importado» pasa a ser una **entrada secundaria** del itinerario («Traer un plan que ya tengo»). | Regla del dueño: no es el foco. |
| D10 | Se elimina todo lo sintético: `trip-twin/demo.ts`, `client/mock.ts`, el sistema local `signals/` y las fotos de Unsplash. | Regla del dueño: solo datos reales. |

---

## 1. Diagnóstico

### 1.1 Qué existe y es real

| Pieza | Archivos | Estado |
|---|---|---|
| Intérprete de horarios de OSM | `src/lib/day/openingHours.ts` | Real y probado. Lo no interpretable devuelve `null`, que se muestra como «horario sin confirmar». |
| Lugares reales | `src/lib/day/places.ts` (`fetchPlaces`), `src/lib/verify/resolve.ts` (`resolvePlace`) | Real (Nominatim). Caché en memoria de 6 h y pausa de 1 s entre llamadas. |
| Traslados | `src/lib/day/routing.ts` (`fetchMatrix`, `leg`) | Real (OSRM de FOSSGIS). A pie y en auto, sin tráfico. |
| Clima por hora y atardecer | `src/lib/day/weather.ts` (`fetchDayWeather`, `fetchDayConditions`, `rainWindows`) | Real (Open-Meteo), hasta unos 15 días. |
| Foto y descripción | `src/lib/day/media.ts` (`fetchMedia`) | Real (Wikipedia), solo para lugares con artículo y con atribución. |
| Planificador de un día | `src/lib/day/planner.ts` (`buildDay`), `src/lib/day/service.ts` (`computeDayPlan`) | Real. Devuelve motivos y alternativas, y ante cada fuente caída degrada con un aviso. |
| Avisos y desastres | `src/lib/sources/fcdo.ts`, `usgs.ts`, `gdacs.ts`, `live.ts`, `overlay.ts` | Real y vivo. |
| Motor de decisión de destino | `src/lib/engine/*` (`evaluateDestination`, `rankDestinations`, `compareDestinations`) | Real en su lógica. Con 4 de 8 factores con dato, la confianza queda bajo 40 % y no publica puntaje. |
| Historial deshacer y rehacer | `src/lib/trip-twin/history.ts` (`pushSnapshot`, `undo`, `redo`) | Real, pero solo conectado a `/trip-twin`. |
| Travel DNA | `src/lib/client/dna-core.ts` | Real, local al dispositivo. El campo «ritmo» se guarda pero no influye en nada. |
| Guardia de cifras | `src/lib/ai/guard.ts` (`checkNumbers`, `guardText`) | Real y probada. Es la base de la guardia del Director. |
| Cliente de IA y presupuesto | `src/lib/ai/client.ts` (`callJson`, `LlmClient`), `src/lib/ai/telemetry.ts` | Real, pero nunca probado con una clave real. |
| PulseMesh en base de datos | `supabase/migrations/0005_pulsemesh.sql`, `src/lib/pulsemesh/model.ts`, `store.ts`, `src/components/PulseMeshPanel.tsx` | Real y verificado en Postgres local. Nunca conectado a un Supabase real. |
| Sincronización en la nube | `src/lib/cloud/*`, `supabase/migrations/0004_user_cloud_data.sql` | Real, verificado con simulaciones. Sin conectar. |

### 1.2 Qué es demo, duplicado o engañoso

| Problema | Evidencia | Consecuencia |
|---|---|---|
| **Dos planificadores** | `buildDay` (`src/lib/day/planner.ts`) elige lugares con horarios y traslados reales para un día. `buildTripPlan` (`src/lib/trip-twin/engine.ts`) valida un orden dado, con presupuesto y versiones, pero no consulta ninguna fuente. | El itinerario con datos reales (`/dia`) no se puede guardar ni deshacer. El que se puede deshacer (`/trip-twin`) muestra datos sintéticos. El PRD lo reconoce: «Guardar y deshacer el día: pendiente». |
| **Un tercer conjunto de reglas** | `verifyItinerary` (`src/lib/verify/checks.ts`) repite las comprobaciones de horario, lluvia y traslado con su propio tipo (`StopVerdict`). | Un mismo lugar puede salir «abierto» en una pantalla y «confirmar» en otra. |
| **Dos sistemas de señales** | `src/lib/signals/*` y `/api/signals` guardan en el navegador (clave `travel-pulse-signals-v1`). `src/lib/pulsemesh/*` usa Supabase. `/trip-twin` y `LiveView` leen el primero; `/dia` y `/ciudad` usan el segundo. | Un reporte creado en `/live` no aparece en `/dia`. El sistema local no tiene corroboración ni moderación. |
| **Trip Twin de demostración** | `src/app/trip-twin/page.tsx` arranca con `DEMO_TRIP` y `DEMO_ACTIVITIES` de `src/lib/trip-twin/demo.ts` (`sourceId: "synthetic-demo-data"`). Tiene una lista fija `attractions` con «Fórmula 1 · GP de São Paulo» y muestra «Demo funcional · Itinerario y datos sintéticos». | Viola la regla del dueño. |
| **Modo demo del cliente** | `src/lib/client/mock.ts` (362 líneas), activado con `NEXT_PUBLIC_USE_MOCK=1` en `src/lib/client/api.ts`. | Datos fabricados alcanzables con una variable de entorno. |
| **Fotos de Unsplash fijas** | `src/app/trip-twin/trip-twin.css` enlaza fotos de `images.unsplash.com` que no corresponden al lugar mostrado. `next.config.ts` las permite en la CSP. | Una foto genérica presentada junto a un lugar real es un dato inventado. |
| **Cuatro lenguajes visuales** | (a) El original de «tablero de salidas» dentro de un marco de 430 px (`src/app/layout.tsx`), usado en resultados, ficha y guardados. (b) La portada a ancho completo, que escapa del marco con `:has(.city-first-home)` en `src/app/globals.css`. (c) `/dia`, con su propia barra lateral (`DesktopNav` en `src/components/day/DayView.tsx`) y otra regla `:has(.day-route)`. (d) `/trip-twin`, con hoja propia, otra barra lateral, otro azul (`#1684ff`), tamaños de 9 a 13 px y un margen negativo para salir del marco. | Tres navegaciones distintas con listas de enlaces distintas (`BottomTabBar` tiene 6 pestañas, `DesktopNav` 8, `tt-nav` otra). |
| **Importadores por expresiones regulares** | `parseItinerary` (`src/lib/trip-twin/import.ts`), `localIntent` (`src/lib/trip-twin/assistant.ts`) y `keywordInterpret` (`src/lib/ai/interpret.ts`). | Solo entienden formatos previstos («Día 1», «09:00 Actividad»). Sirven como respaldo sin IA, no como camino principal. |
| **Geocodificación y clima duplicados** | `src/app/api/live-data/route.ts` trae su propio `fetchJson`, sin los errores tipificados de `src/lib/sources/http.ts`. | Dos políticas de error y de caché para la misma fuente. |
| **Precios de IA incorrectos** | `PRICING_USD_PER_MTOK` en `src/lib/ai/telemetry.ts` está rotulado «PLACEHOLDER» (Haiku 1/5, Sonnet 3/15). No incluye Opus ni Fable. | El presupuesto mensual se calcula con tarifas falsas. |
| **Estado en memoria del proceso** | Cachés (`places.ts`, `resolve.ts`, `media.ts`), límite por IP (`rateLimit` en `src/lib/server/http.ts`) y gasto de IA. | En un despliegue con varias instancias no se comparten: se repiten llamadas a Nominatim y el presupuesto de IA no es global. |
| **Playwright no está declarado** | Los `qa/e2e-*.js` usan `require('playwright')`, pero `package.json` no lo incluye ni tiene un script `e2e`. | Los E2E no son reproducibles con `npm ci`. |
| **PulseMesh sin lugar** | `pulse_signals` tiene `city_key` y coordenadas redondeadas a 1 km, pero ninguna referencia al lugar. | No se pueden mostrar reportes «por parada» sin una migración nueva. |

### 1.3 Qué se corta

| Se elimina | Reemplazo |
|---|---|
| `src/lib/trip-twin/demo.ts`, la lista `attractions` y todos los textos «demo» de `src/app/trip-twin/page.tsx` | Estado vacío real: «Todavía no tienes un viaje. Cuéntanos a dónde vas». |
| `src/app/trip-twin/trip-twin.css` completo | Componentes del sistema unificado. |
| `src/lib/client/mock.ts` y las ramas `USE_MOCK` de `src/lib/client/api.ts` | Pruebas con respuestas reales grabadas. |
| `src/lib/signals/*`, `src/app/api/signals/route.ts`, `src/components/screens/LiveView.tsx` | PulseMesh (`src/lib/pulsemesh/*`). |
| `https://images.unsplash.com` en la CSP de `next.config.ts` | Solo Wikimedia con atribución, o ninguna foto. |
| `src/lib/trip-twin/city-workspace.ts` (clave `travel-pulse.city-workspaces.v1`) | El Viaje único. Se migra lo guardado una sola vez. |
| `DesktopNav` de `DayView.tsx`, `tt-sidebar`, las reglas `:has(...)` de `globals.css` y el `max-w-[430px]` de `layout.tsx` | `AppShell`. |
| `src/components/lux/GlobeHero.tsx` (globo decorativo sin datos) | Un mapa real con datos reales, o nada. |
| Rutas `/dia`, `/trip-twin`, `/importar`, `/verificar`, `/live`, `/ciudad`, `/resultados`, `/comparar`, `/sorpresa`, `/guardados`, `/perfil`, `/cuenta` | Redirecciones a las 5 rutas nuevas (§2.1). |

**Qué se conserva tal cual:** `openingHours.ts`, `routing.ts`, `weather.ts`, `media.ts`, `places.ts`, `resolve.ts`, `history.ts`, `guard.ts`, `sources/*`, `engine/*`, `pulsemesh/*`, `cloud/*`, `dna-core.ts` y sus pruebas. Son el valor real del repositorio.

---

## 2. La experiencia objetivo

### 2.1 Mapa de rutas

| Ruta nueva | Pantalla | Absorbe |
|---|---|---|
| `/` | 1. Intención | `/` actual |
| `/destinos` | 2. Decidir destino | `/resultados`, `/comparar`, `/sorpresa`, `/destino/[id]` |
| `/viaje/[id]` | 3. Itinerario · 4. Modificar y deshacer · 5. En vivo | `/dia`, `/trip-twin`, `/importar`, `/verificar` |
| `/pulso` | 7. Reportes de viajeros y Radar | `/live`, `/radar`, `/ciudad` |
| `/yo` | 6. Mis viajes, Travel DNA y cuenta | `/guardados`, `/perfil`, `/cuenta`, `/feedback/*` |

Las pantallas 3, 4 y 5 son **la misma ruta en tres momentos**: antes del viaje se planifica, al editar se compara y durante el viaje se adapta. No se cambia de sitio para hacer cada cosa.

### 2.2 Pantalla 1 — Intención (`/`)

**Propósito.** Que la persona diga qué quiere en una frase o en cuatro campos y llegue a un destino o a un itinerario en un solo paso.

**Contenido.**
- Un campo de texto libre: «Tengo cinco días en marzo, quiero naturaleza y buena comida, salgo desde Santiago».
- Debajo, lo que la app entendió, como fichas editables: origen, fechas o mes, días, intereses, ritmo. La persona corrige antes de continuar.
- Dos salidas según lo entendido: **«Ya sé a dónde voy»** lleva a crear el viaje; **«Ayúdame a elegir»** lleva a `/destinos`.
- Si hay un viaje en curso: una tarjeta «Continúa tu viaje a São Paulo · jueves 5», con su próxima parada.
- Si hay Travel DNA: «Usar lo que ya sé de ti», con el detalle visible.
- Una franja fija: «Qué sabemos y qué no», con las fuentes activas y lo que falta (precios).

| Elemento | Dato real | Fuente |
|---|---|---|
| Fichas de intención | Texto de la persona | Haiku 5.5 con esquema; respaldo `keywordInterpret` |
| Ciudad reconocida | Nombre, país, coordenadas, zona horaria | Geocodificación (Nominatim u Open-Meteo, §5.2) |
| Viaje en curso | Viaje guardado | Dispositivo o Supabase (`user_trips`) |
| Estado de fuentes | Hora de la última respuesta de cada fuente | `src/lib/sources/live.ts` y registros del motor |

**Estados.**
- *Cargando:* las fichas aparecen una a una; el campo de texto sigue editable.
- *Vacío:* primera visita, con tres ejemplos escritos que se pueden tocar. No hay destinos «populares» inventados.
- *Sin IA* (sin clave o sin presupuesto): el campo libre usa `keywordInterpret` y se muestra el formulario de cuatro campos. Se dice: «Entendí esto con reglas simples; revísalo».
- *Ciudad no encontrada:* «No encontré "X". Prueba con ciudad y país».
- *Ambigua:* lista de candidatos con país y región; nunca se elige en silencio.

**Móvil y escritorio.** En móvil, una columna con el campo de texto arriba y las fichas debajo. En escritorio, dos columnas: intención a la izquierda y, a la derecha, el mapa real con el viaje en curso o el destino reconocido.

### 2.3 Pantalla 2 — Decidir destino (`/destinos`)

**Propósito.** Elegir entre 2 y 4 destinos con hechos comparables, sin un número que no se puede sostener.

**Contenido.**
- Lista de destinos que encajan, ordenados por afinidad de intereses y clima del mes. El criterio de orden está escrito encima de la lista.
- Cada tarjeta muestra **solo factores con dato**: clima del mes, aviso oficial, eventos naturales cercanos, tendencia de interés y afinidad. La afinidad va rotulada «clasificación de Travel Pulse», porque es editorial.
- En cada tarjeta, **lo que falta**: «Sin precio de vuelo · Sin costo diario».
- Un medidor de cobertura: «4 de 8 factores con dato». Mientras esté bajo el umbral del motor (`CONFIDENCE_LIMITED = 40` en `src/lib/types.ts`), **no hay puntaje**.
- Comparador: se seleccionan de 2 a 4 tarjetas y se abre una tabla por factor, una fila por factor y una columna por destino. Hoy `compareDestinations` admite 2; se amplía.
- Acción principal de cada tarjeta: **«Armar mi viaje aquí»**.
- «Sorpréndeme» queda como un botón de esta pantalla, no como sección.

| Elemento | Dato real | Fuente y fecha |
|---|---|---|
| Clima del mes | Temperatura, lluvia y viento medios | Open-Meteo ERA5, 2015–2024 (`real.generated.json`) |
| Aviso oficial | Nivel 1–4 por país | FCDO, consultado cada 6 h |
| Eventos naturales | Sismos y alertas naranja o roja cercanas | USGS (10 min), GDACS (15 min) |
| Tendencia de interés | Visitas al artículo, 30 días frente a los 30 previos | Wikimedia Pageviews (instantánea con fecha) |
| Afinidad | 0–5 por interés | Editorial de Travel Pulse (no es observación) |
| Foto y descripción | Miniatura y resumen | Wikipedia, con atribución |
| Precio y costo | — | **Sin fuente** (§5.3) |

**Estados.**
- *Cargando:* esqueletos de tarjeta con el tamaño final.
- *Vacío:* «Ningún destino de nuestra base encaja con eso», con qué restricción relajar (el motor ya calcula `EmptyHelp`).
- *Fuente viva caída:* el factor muestra el último dato bueno con su antigüedad y la etiqueta «desactualizado» (comportamiento actual de `overlay.ts`).
- *Sin dato:* la celda dice «sin dato» y no cuenta ni a favor ni en contra.

**Límite declarado.** El descubrimiento cubre los 30 destinos de la base editorial. El itinerario cubre cualquier ciudad. Esa diferencia se dice en pantalla: «Comparamos 30 destinos; si ya tienes otro en mente, escríbelo».

**Móvil y escritorio.** En móvil, tarjetas apiladas y comparador como hoja inferior con desplazamiento horizontal por destino. En escritorio, lista a la izquierda, mapa con los destinos a la derecha y comparador como tabla completa.

### 2.4 Pantalla 3 — Itinerario (`/viaje/[id]`)

**Propósito.** Ver el viaje completo, día por día, con lo que se sabe y lo que no.

**Contenido.**
- **Cabecera:** destino, fechas, selector de día y una línea de estado: «Día 2 · 4 paradas · 1 horario sin confirmar · lluvia probable de 15:00 a 18:00».
- **Línea de tiempo del día:** traslado, parada, traslado, parada. Es la estructura de `StopCard` en `DayView.tsx`, que se conserva.
- **Tarjeta de parada:**
  - hora de inicio y fin; la duración va rotulada «supuesto» y es editable;
  - sello de horario: «Abierto · cierra 20:00» o «Horario sin confirmar»;
  - traslado desde la anterior: «12 min a pie» o «18 min en auto, sin tráfico»;
  - lluvia durante la visita o el trayecto;
  - **línea de viajeros** (§6);
  - «Por qué este lugar»: los motivos que ya devuelve el motor;
  - foto con atribución solo si existe.
- **Mapa** con las paradas numeradas y el trazo entre ellas.
- **Panel de contexto:** clima por hora, atardecer, aviso oficial del país, fuentes consultadas con su hora y supuestos del plan.
- **Lo que no cupo:** deseos sin ubicar, con el motivo («el museo cierra los lunes»).
- **Entrada secundaria:** «Traer un plan que ya tengo» (Reality Check). El texto pegado se convierte en paradas del mismo viaje y pasa por las mismas comprobaciones.

| Elemento | Dato real | Fuente | Si falta |
|---|---|---|---|
| Lugar, coordenadas | Objeto de OSM | Nominatim | La parada no se crea; el deseo va a «no cupo» |
| Horario | `opening_hours` | OSM | «Horario sin confirmar» y enlace al sitio oficial si OSM lo trae |
| Traslado | Matriz de minutos | OSRM FOSSGIS | «Sin dato de traslado: reservamos 30 min» |
| Lluvia por hora | Probabilidad | Open-Meteo | «Sin pronóstico para esa fecha: no evaluamos la lluvia» |
| Atardecer | Hora local | Open-Meteo | No se muestra |
| Foto y descripción | Resumen del artículo | Wikipedia | Sin foto; nunca una genérica |
| Aviso del país | Nivel y fecha | FCDO | «No se pudo verificar en vivo» |
| Reportes | Vista pública | PulseMesh | «Aún no hay reportes aquí» |
| Duración de la visita | — | **Supuesto** del producto | Siempre rotulado y editable |
| Precio | — | **Sin fuente** | «Precio sin dato» o lo que la persona escriba («dado por ti») |

**Estados.**
- *Cargando:* el plan llega por partes y se dice qué se está consultando: «Buscando museos… calculando traslados… revisando la lluvia». Nominatim exige pausas, así que la espera es real y se explica.
- *Vacío:* viaje sin paradas, con «Dime qué quieres hacer» y fichas de tipos de lugar.
- *Error parcial:* una franja por fuente caída con «Reintentar». El plan se muestra con lo que hay.
- *Error total* (sin lugares): «No pudimos consultar el mapa. Tu viaje está guardado; reintenta en un momento».
- *Sin conexión:* última versión guardada, con la hora, y edición bloqueada para lo que requiere fuentes.
- *Cobertura baja:* «En esta ciudad solo 2 de 14 restaurantes tienen horario en el mapa. Confírmalos antes de ir».

**Móvil y escritorio.** En escritorio, tres zonas: línea de tiempo (centro), mapa (derecha, fijo al desplazar) y contexto (bajo el mapa o panel plegable). En móvil, una columna con la línea de tiempo; el mapa es una hoja que sube desde abajo y el contexto es un resumen plegado en la cabecera. El selector de día es una fila deslizable en ambos.

### 2.5 Pantalla 4 — Modificar y deshacer (modo de `/viaje/[id]`)

**Propósito.** Cambiar el plan sin miedo: todo cambio se previsualiza, se explica y se puede deshacer.

**Contenido.**
- **Acciones directas por parada:** mover antes o después, cambiar por una alternativa cercana (el motor ya devuelve hasta 3), quitar, fijar hora, cambiar duración.
- **Acciones del día:** agregar una parada por tipo o por nombre, cambiar hora de inicio o fin, cambiar el punto de partida.
- **Petición en lenguaje natural:** «Saca el museo y pon algo al aire libre por la tarde». El Director la traduce a operaciones del motor (§4.3).
- **Propuesta antes de aplicar:** toda modificación que mueva más de una parada se muestra como comparación *antes y después*: qué cambia de hora, qué entra, qué sale, qué pasa a «sin confirmar» y por qué. Botones: **Aplicar** y **Descartar**.
- **Barra de historial:** Deshacer, Rehacer y lista de los últimos 20 cambios con su etiqueta («Quitaste MASP», «Cambio por lluvia»).
- **Versiones con nombre:** «Guardar como Plan B». Pendiente en la matriz; se agrega aquí.

| Elemento | Dato real | Fuente |
|---|---|---|
| Alternativas | Lugares factibles a esa hora | Motor (`Alternative`) con OSM y OSRM |
| Consecuencias | Diferencia entre dos planes | Motor, determinista |
| Explicación en frases | Hechos de la diferencia | Director (IA) con guardia; sin IA, plantilla |
| Historial | Instantáneas | `history.ts`; dispositivo o `user_trips.history` |

**Estados.**
- *Propuesta inviable:* «Con ese cambio el restaurante queda fuera de horario». Se ofrece la opción más cercana que sí funciona.
- *Petición no entendida:* «No estoy seguro de qué cambiar. ¿Quieres quitar, mover o agregar algo?». Nunca se adivina.
- *Sin IA:* las acciones directas funcionan igual; el campo de texto usa reglas (`localIntent`) y lo dice.
- *Nada que deshacer:* botón deshabilitado con su motivo.

**Móvil y escritorio.** En escritorio la propuesta se muestra como dos columnas (antes y después) sobre la línea de tiempo. En móvil es una hoja inferior con la lista de diferencias y un interruptor antes/después. Las acciones por parada son botones visibles en escritorio y un menú por parada en móvil. No se usa arrastrar como único medio: siempre hay botones.

### 2.6 Pantalla 5 — En vivo (modo «Hoy» de `/viaje/[id]`)

**Propósito.** Durante el viaje, avisar cuando algo cambia y proponer un ajuste. Nunca cambiar el plan sin aprobación.

**Contenido.**
- **Ahora y después:** la parada actual y la siguiente, con cuánto falta y cómo llegar.
- **Avisos**, cada uno con origen y hora:
  1. *Lluvia:* el pronóstico actualizado supera el umbral (`RAIN_THRESHOLD = 50`) sobre una parada al aire libre.
  2. *Horario:* la parada quedaría fuera de su horario por un atraso.
  3. *Viajeros:* un reporte **corroborado** de «lugar cerrado» o «fila larga» en una parada del día.
  4. *Oficial:* cambio en el aviso del país, o un sismo o alerta cercana.
  5. *Tú:* «Voy atrasado 30 min», «Estoy cansado», «Quiero un pub».
- **Propuesta de ajuste** por aviso, con el mismo componente de la pantalla 4: antes y después, motivo, Aplicar o Ignorar.
- **Al terminar una parada:** una pregunta opcional de un toque: «¿Estaba abierto?», «¿Había fila?» (§6).

**Cómo se detectan los cambios.** No hay vigilancia en segundo plano ni seguimiento de ubicación. El plan se reevalúa al abrir la pantalla, al tocar «Revisar ahora» y, con la pantalla abierta, cada cierto tiempo usando la caché del servidor. Las notificaciones push quedan fuera de esta etapa (§8).

| Elemento | Dato real | Fuente |
|---|---|---|
| Lluvia actualizada | Pronóstico por hora | Open-Meteo, caché por ciudad y día |
| Reporte corroborado | Estado `corroborada` (3 o más personas distintas) | `pulse_signals_public` |
| Aviso oficial | Nivel o evento | FCDO, GDACS, USGS |
| Hora actual | Reloj del dispositivo en la zona del destino | — |

**Estados.**
- *Sin cambios:* «Revisado a las 14:05. Nada cambió». Con hora, para que se pueda confiar.
- *No se pudo revisar:* «No pudimos revisar el clima desde las 13:10».
- *Reporte sin corroborar:* se muestra como nota en la parada; **no** genera propuesta.
- *Fuera de las fechas del viaje:* el modo «Hoy» no aparece.

**Móvil y escritorio.** Es la pantalla que más se usa en móvil: una columna con «Ahora» fijo arriba, avisos y la línea de tiempo restante. En escritorio es la pantalla 3 con una franja de avisos sobre la línea de tiempo.

### 2.7 Pantalla 6 — Mis viajes y Travel DNA (`/yo`)

**Propósito.** Que nada se pierda y que la persona controle lo que la app sabe de ella.

**Contenido.**
- **Mis viajes:** próximos, en curso y pasados. Cada uno con fechas, número de paradas y última modificación.
- **Destinos guardados.**
- **Travel DNA:** intereses, presupuesto habitual, días, ritmo, origen. Todo explícito y editable. El **ritmo** por fin se usa: define cuántas paradas por día propone el motor.
- **Lo que aprendimos de tus viajes:** sugerencias separadas («En tus 3 viajes agregaste siempre un parque. ¿Lo sumo a tus intereses?»). Se aceptan o se descartan; nunca se aplican solas (`suggestInterests` ya lo hace con guardados).
- **Después del viaje:** «¿Te sirvió el plan?» con una respuesta y un comentario opcional. Alimenta la métrica norte.
- **Cuenta y datos:** iniciar sesión, sincronizar, exportar, borrar todo (`delete_my_cloud_data` ya existe).

| Elemento | Dato real | Fuente |
|---|---|---|
| Viajes e historial | Documento del viaje | Dispositivo; con cuenta, `user_trips` |
| DNA | Preferencias declaradas | Dispositivo (`tp-dna`); con cuenta, nube |
| Utilidad del viaje | Respuesta de la persona | Tablas `expectations` y `experiences` de `0001_init.sql` |

**Estados.**
- *Sin viajes:* «Aún no tienes viajes», con el botón de crear uno.
- *Sin cuenta:* todo funciona en el dispositivo, con el aviso «Solo en este dispositivo. Inicia sesión para no perderlo».
- *Nube no configurada:* la opción de cuenta no se ofrece (comportamiento actual de `readCloudConfig`).
- *Conflicto de sincronización:* se informa qué versión se conservó (`merge.ts`).

**Móvil y escritorio.** En móvil, secciones apiladas con viajes primero. En escritorio, dos columnas: viajes y guardados a la izquierda, DNA y cuenta a la derecha.

### 2.8 Pantalla 7 — Reportes de viajeros (`/pulso` y hoja por parada)

**Propósito.** Ver y aportar lo que otras personas observaron, siempre rotulado como no oficial.

**Contenido.**
- **Hoja de una parada** (desde las pantallas 3 y 5): reportes vigentes de ese lugar, con tipo, antigüedad, cuántas personas lo respaldan y estado. Acciones: Confirmar, Contradecir, Marcar, Reportar.
- **Reportar en 30 segundos:** categoría, tipo (lista cerrada de `KINDS` en `pulsemesh/model.ts`), un título corto y, para precios, monto y moneda. El lugar ya viene dado por la parada.
- **`/pulso`:** reportes de la ciudad del viaje en curso y, aparte y con otro color, el **Radar oficial** (FCDO, USGS, GDACS). Las dos capas nunca se mezclan en una misma lista.
- Rótulo fijo: «Reportes de viajeros. No son información oficial».

Los datos, la moderación, la privacidad y el arranque sin comunidad están en §6.

**Estados.**
- *Sin reportes:* «Aún no hay reportes de viajeros aquí». Sin ejemplos ni relleno.
- *Sin sesión:* se puede leer; para reportar se pide iniciar sesión, con el motivo («para evitar reportes duplicados»).
- *Nube no conectada:* la sección dice «Los reportes de viajeros todavía no están activos» y no muestra formulario.
- *Ciudad fuera del piloto:* «Los reportes están abiertos en Santiago, São Paulo y Valparaíso».
- *En disputa:* se muestra como tal, con ambas cuentas.

**Móvil y escritorio.** En móvil, la hoja de parada sube desde abajo y el formulario ocupa la pantalla. En escritorio, la hoja es un panel lateral sobre el contexto y `/pulso` muestra lista y mapa lado a lado.

---

## 3. Sistema de diseño unificado

### 3.1 Principios

1. **Un lenguaje, no cuatro.** Se toma como base el de la portada y `/dia`: azul noche, cian, tarjetas con borde fino, Archivo para títulos e Instrument Sans para texto. Ya están en `globals.css` y `layout.tsx`.
2. **El estado del dato es parte del diseño.** Ningún número aparece sin su sello.
3. **Diseñar desde el contenido.** Cada pantalla se define primero a 390 px y a 1280 px a la vez. No hay un «marco de teléfono» en escritorio.
4. **Color nunca es el único canal.** Todo estado lleva texto e icono.

### 3.2 Tokens

Se conservan los tokens semánticos `--c-*` de `src/app/globals.css` (tema oscuro por defecto y claro disponible). Cambios:

| Grupo | Token | Valor (oscuro) | Uso |
|---|---|---|---|
| Fondo | `--c-page`, `--c-surface` | `#070c18`, `#0f1626` (actuales) | Página y tarjetas |
| Texto | `--c-fg`, `--c-fg2`, `--c-mid` | actuales | Principal, secundario, auxiliar |
| Acción | `--signal` | `#46d4f2` (actual) | Acción principal y selección |
| Dato confirmado | `--c-good` | `#5fd0a5` (actual) | «Abierto», fuente oficial vigente |
| Dato sin confirmar | `--c-warn` (**nuevo**) | `#f0a53a` | Reemplaza el valor fijo que hoy está escrito en `DayView.tsx` |
| Alerta | `--c-alert` | `#ff8a78` (actual) | Cerrado, conflicto, aviso oficial alto |
| Comunidad | `--c-community` (**nuevo**) | por definir con prueba de contraste | Todo lo que venga de viajeros |
| Supuesto | `--c-mid` con borde punteado | — | Duraciones y márgenes |
| Espaciado | escala de 4 px: 4, 8, 12, 16, 24, 32, 48 | — | Único |
| Radios | 8 (fichas), 16 (tarjetas), 24 (hojas y paneles) | — | Hoy cada pantalla usa los suyos |
| Tipografía | 12, 14, 16, 20, 28, 40 px | — | Mínimo 12 px. `/trip-twin` usa 9 px: se elimina |
| Anchos | contenido máx. 1440 px; lectura máx. 68 caracteres | — | — |
| Puntos de quiebre | 640, 1024, 1440 | — | Hoy hay 430, 560, 768, 799, 800, 950, 1024, 1250 |

Regla de implementación: **ningún color en hexadecimal dentro de un componente**. Un test de lint lo impide.

### 3.3 Navegación única

Cuatro destinos, los mismos en todos los tamaños:

| Destino | Ruta | Contiene |
|---|---|---|
| **Inicio** | `/` | Intención, viaje en curso |
| **Mi viaje** | `/viaje/[id]` (el viaje activo) o `/destinos` si no hay viaje | Decidir, itinerario, modificar, en vivo |
| **Pulso** | `/pulso` | Reportes de viajeros y Radar oficial |
| **Yo** | `/yo` | Viajes, guardados, DNA, cuenta |

- **Móvil (menos de 1024 px):** barra inferior con 4 pestañas. Hoy `BottomTabBar` tiene 6 y los textos no caben holgados a 390 px.
- **Escritorio (1024 px o más):** riel lateral izquierdo con los mismos 4 destinos, icono y texto. Se contrae a iconos entre 1024 y 1279 px.
- **Un solo componente** `AppShell` en `src/app/layout.tsx` decide cuál mostrar. Ninguna pantalla trae su propia navegación.
- Dentro de «Mi viaje», la navegación secundaria es el selector de día y las pestañas Plan · Hoy, no más enlaces globales.

### 3.4 Componentes

| Componente | Función | Origen |
|---|---|---|
| `AppShell` | Riel o barra, área de contenido, zona de avisos | Nuevo; reemplaza `BottomTabBar`, `DesktopNav`, `tt-sidebar` |
| `SelloDato` | Estado, fuente y antigüedad de un dato | Nuevo; generaliza `StatusChip` de `DayView.tsx` y `ConfidenceBar.tsx` |
| `TarjetaParada` | Parada con hora, sellos, traslado y viajeros | De `StopCard` en `DayView.tsx` |
| `TramoTraslado` | Minutos, modo y lluvia en el trayecto | De `DayView.tsx` |
| `LineaTiempo` | Lista de tramos y paradas de un día | De `DayView.tsx` |
| `Mapa` | Mapa con paradas numeradas | De `DayMap.tsx` (Leaflet) |
| `Propuesta` | Antes y después, motivo, Aplicar o Descartar | Nuevo; se usa en pantallas 4 y 5 |
| `BarraHistorial` | Deshacer, rehacer, lista de cambios | De `/trip-twin` |
| `LineaViajeros` | Resumen de reportes de una parada | Nuevo |
| `HojaReportes` | Lista y formulario de reportes | De `PulseMeshPanel.tsx` |
| `MedidorCobertura` | «N de M con dato» | Nuevo |
| `EstadoFuente` | Fuente, estado, hora, reintentar | De `SourceNote` en `service.ts` |
| `Cargando`, `Vacio`, `ErrorPanel` | Estados | De `StatePanels.tsx` |
| `Hoja` | Panel inferior en móvil y lateral en escritorio | Nuevo |
| `Button`, `Chip`, `Slider`, `Stepper`, `Toggle` | Controles | Existentes en `src/components/ui/` |

### 3.5 Cómo se muestra la confianza

Cada dato visible pertenece a una de seis clases (Maestro §15). La gramática del sello es siempre **estado · fuente · antigüedad**.

| Clase | Ejemplo en pantalla | Aspecto |
|---|---|---|
| **Oficial** | «Aviso nivel 2 · FCDO · consultado hace 3 h» | Icono de escudo, `--c-good` o `--c-alert` según nivel |
| **Proveedor** | «Abierto, cierra 20:00 · OpenStreetMap» · «12 min a pie · OSRM» | Icono de verificación, `--c-good` |
| **Comunidad** | «Fila larga · 3 viajeros · hace 40 min · no oficial» | Icono de personas, `--c-community` |
| **Histórico** | «Marzo suele tener 14 °C · promedio 2015–2024» | Icono de reloj, `--c-mid` |
| **Supuesto** | «90 min de visita · supuesto, puedes cambiarlo» | Borde punteado, `--c-mid` |
| **Sin dato** | «Horario sin confirmar» · «Precio sin dato» | Icono de interrogación, `--c-warn` |

Reglas:
- «Sin dato» nunca se oculta ni se reemplaza por un valor por defecto. Se escribe.
- Un dato vencido cambia a «desactualizado» y conserva su fecha.
- Al tocar cualquier sello se abre el detalle: fuente, licencia, hora exacta de consulta y texto original (por ejemplo, el `opening_hours` crudo).
- Un resumen por pantalla: «Este día: 3 horarios confirmados, 1 sin confirmar, traslados reales, lluvia evaluada».

### 3.6 Tono de voz

- De tú, español neutro, frases cortas. Primero el hecho, después la consecuencia.
- Se dice lo que no se sabe con la misma naturalidad que lo que se sabe: «No sé si estará abierto: el mapa no trae su horario».
- Nunca: «garantizado», «100 % seguro», «el mejor», «imperdible», ni calificaciones de barrios o personas. `hasUnsafeLanguage` en `guard.ts` ya lo bloquea en textos de IA; se aplica también a textos fijos mediante un test.
- Las propuestas explican el motivo y la consecuencia: «Llueve de 15:00 a 18:00. Propongo cambiar el parque por el Museo X, a 8 min a pie, abierto hasta las 19:00. Llegarías al restaurante 20 min más tarde».
- Los errores dicen qué pasó y qué hacer, sin culpar: «El mapa no respondió. Tu plan sigue guardado. Reintentar».
- Un nombre por cosa: «viaje», «día», «parada», «traslado», «reporte», «aviso». Se retiran «workspace», «señal» y «score» de la interfaz.

---

## 4. Arquitectura

### 4.1 Capas

```
Interfaz (src/app, src/components)
        │  solo llama a /api/*
API (src/app/api)            ── validación zod, límites, sesión
        │
Director de IA (src/lib/director)   ── interpreta, conversa, pide herramientas
        │  llama herramientas; nunca calcula
Motor único (src/lib/plan)   ── puro y determinista: planifica, valida, compara, deshace
        │  recibe datos ya obtenidos
Proveedores (src/lib/providers)     ── lugares, rutas, clima, medios, avisos, reportes, precios
        │
Caché y registro (src/lib/providers/cache, src/lib/obs)
```

Regla de dependencia: el motor no importa nada de red ni de IA. El Director no importa proveedores: solo herramientas.

### 4.2 El motor único (`src/lib/plan/`)

| Módulo nuevo | Qué hace | De dónde sale |
|---|---|---|
| `plan/tipos.ts` | Contratos de §4.4 | `trip-twin/types.ts` + `day/planner.ts` |
| `plan/colocar.ts` | Elige y ubica paradas de un día con horarios, traslados y esperas | `buildDay`, `tryPlace`, `pickNext` de `day/planner.ts` |
| `plan/viaje.ts` | Reparte deseos entre varios días según ritmo, sin repetir lugares | **Nuevo** (hoy solo hay un día) |
| `plan/revisar.ts` | Comprueba cualquier plan y devuelve hallazgos | `verifyItinerary` (`verify/checks.ts`) + violaciones de `buildTripPlan` |
| `plan/cambios.ts` | Aplica una operación a una copia y devuelve el plan nuevo | `replanTrip` + `swapOutdoorForIndoor`, `addStopWish` |
| `plan/diferencia.ts` | Compara dos planes y lista consecuencias | **Nuevo** |
| `plan/historial.ts` | Deshacer, rehacer, versiones con nombre | `trip-twin/history.ts` |
| `plan/disparadores.ts` | Dado un plan y datos nuevos, dice qué paradas se ven afectadas | **Nuevo**; usa `rainRiskBetween`, `statusAt` |
| `plan/presupuesto.ts` | Suma solo costos conocidos | `trip-twin/budget.ts` |

Propiedades que el motor garantiza y que las pruebas comprueban:
- Ninguna parada con horario conocido queda fuera de él.
- Una parada sin horario queda siempre como `sin_confirmar`.
- Toda cifra de salida proviene de una entrada (`Dato`) o está marcada `supuesto`.
- Misma entrada, misma salida. Sin reloj ni aleatoriedad interna; `ahora` es un parámetro.
- `revisar` se ejecuta sobre **todo** plan, lo haya creado el motor, la persona o un texto importado. Así «Verificar itinerario» deja de ser un sistema aparte.

### 4.3 El Director de IA (`src/lib/director/`)

**Qué es.** Un bucle de herramientas en el servidor (`POST /api/director`, con respuesta en flujo). Recibe el mensaje de la persona y el identificador del viaje. Decide qué herramientas llamar, y devuelve un mensaje corto y, si corresponde, una propuesta.

**Qué no hace.** No escribe horas, duraciones, distancias, precios ni horarios. No aplica cambios. No recuerda nada fuera del Travel DNA que la persona autorizó.

**Herramientas.** Todas con esquema estricto (`strict: true`) y validación zod en el servidor.

| Herramienta | Entrada | Devuelve | Efecto |
|---|---|---|---|
| `resolver_ciudad` | texto | Candidatos: nombre, país, región, coordenadas, zona horaria | Lectura |
| `buscar_destinos` | intereses, mes, días, origen | Destinos de la base con factores con dato y lo que falta | Lectura (motor `engine`) |
| `comparar_destinos` | 2 a 4 ids | Tabla por factor con fuente y fecha | Lectura |
| `buscar_lugares` | ciudad, tipo o nombre, cerca de | Lugares con id, horario (o `null`), enlace y cobertura | Lectura |
| `consultar_clima` | ciudad, fecha | Lluvia por hora, atardecer, o «fuera de alcance» | Lectura |
| `consultar_avisos` | país o ciudad | Aviso oficial y eventos cercanos con fecha | Lectura |
| `consultar_reportes` | ciudad, lugar opcional | Reportes vigentes con estado y recuento | Lectura |
| `armar_itinerario` | ciudad, fechas, deseos, ritmo | Plan completo del motor, con motivos y lo que no cupo | Crea un **borrador** |
| `proponer_cambio` | id del plan, operaciones | Plan nuevo, diferencia y hallazgos | Crea una **propuesta**; no aplica |
| `revisar_plan` | id del plan | Hallazgos por parada | Lectura |
| `leer_preferencias` | — | Campos del DNA autorizados | Lectura, solo con consentimiento |

Las operaciones de `proponer_cambio` son una lista cerrada: `quitar`, `agregar`, `mover`, `cambiar_por`, `fijar_hora`, `cambiar_duracion`, `cambiar_ventana_del_dia`, `cambiar_origen`, `techo_por_lluvia`. El Director elige operaciones; el motor calcula el resultado.

**Validación (cuatro guardias, en este orden).**
1. **Esquema.** La salida final usa salida estructurada (`output_config.format`) con el esquema `{ mensaje, referencias[], propuestaId? }`. Las entradas de herramientas se validan con zod.
2. **Guardia de referencias.** Todo id de lugar, plan o propuesta citado debe existir en el *libro de hechos* del turno, que es el registro de lo que devolvieron las herramientas. Si no existe, se rechaza.
3. **Guardia de cifras.** `checkNumbers` (`guard.ts`) compara cada número del mensaje con el libro de hechos. Una cifra que no esté ahí invalida el mensaje.
4. **Guardia de lenguaje.** `hasUnsafeLanguage`.

Si una guardia falla, se reintenta una vez indicando el motivo. Si vuelve a fallar, se muestra la **plantilla determinista** construida con la diferencia del motor. La persona siempre recibe la propuesta, con o sin frases de IA.

**Datos no confiables.** Los nombres de lugares, los textos de reportes y el itinerario pegado se entregan al modelo como datos, no como instrucciones, igual que ya hacen `CRITIC_SYSTEM` e `INTENT_SYSTEM`. Antes de enviar texto libre se aplica `stripPII`.

**Restricciones de los modelos que condicionan el diseño.**
- En `claude-fable-5-2`, `claude-opus-5-5` y `claude-sonnet-5-5` no se puede forzar una herramienta (`tool_choice` forzado devuelve error). Se usa `auto`, instrucciones claras y salida estructurada.
- No se envía `temperature`.
- En Fable el pensamiento está siempre activo; la profundidad se regula con `output_config.effort`.
- Hay que tratar `stop_reason: "refusal"` y activar `fallbacks`. En Haiku no hay respaldo del lado del servidor: el respaldo es el camino determinista.
- Los turnos de Fable pueden ser largos: respuesta en flujo y progreso visible. Los límites actuales de `client.ts` (6 000 y 2 500 ms) no sirven para el Director.
- Fable exige retención de datos de 30 días (no admite retención cero). Se refleja en la política de privacidad.

### 4.4 Qué tarea usa qué modelo

Orden de preferencia del Maestro §13: reglas, luego modelo económico, luego modelo capaz.

| Tarea | Quién la hace | Por qué |
|---|---|---|
| Planificar, validar, comparar planes, lluvia, horarios, traslados, presupuesto, puntaje de destino | **Sin modelo** (motor) | Son cálculos. Un modelo aquí solo agrega riesgo. |
| Detectar cambios en vivo | **Sin modelo** (`disparadores`) | Comparación de datos. |
| Entender la intención inicial («cinco días, naturaleza…») | `claude-haiku-5-5` | Extracción a esquema, volumen alto, respuesta corta. Respaldo: `keywordInterpret`. |
| Convertir un itinerario pegado en paradas | `claude-haiku-5-5` | Extracción. Respaldo: `parseItinerary`. |
| Estructurar el detalle libre de un reporte y detectar datos personales | `claude-haiku-5-5` | Clasificación. La categoría y el tipo ya son listas cerradas. |
| Frases de una tarjeta («por qué este lugar») | Plantilla; `claude-haiku-5-5` solo si se mide que mejora | El motor ya entrega los motivos. |
| Turno del Director: petición de cambio sobre un plan | `claude-sonnet-5-5` | Elegir herramientas y explicar con criterio, con latencia de conversación. |
| Componer un viaje de varios días con restricciones en conflicto | `claude-fable-5-2`, **solo si la medición lo justifica** | Es la tarea de mayor razonamiento. Ver hipótesis abajo. |
| Revisión crítica de una muestra de respuestas, fuera de línea | `claude-opus-5-5` por lotes | Calidad sin afectar la latencia; el procesamiento por lotes cuesta la mitad. |
| Etiquetado editorial de destinos | `claude-haiku-5-5` por lotes, con revisión humana | Tarea repetitiva; el resultado es editorial y se rotula así. |

**Hipótesis por medir antes de fijar el modelo del Director.** Hay dos configuraciones razonables:
- **A, escalera:** Sonnet para los turnos normales y Fable solo para composición difícil.
- **B, un solo modelo:** Fable con esfuerzo bajo o medio para todo el Director.

La B puede resultar más simple y con mejor aprovechamiento de caché, porque la caché de instrucciones es por modelo. No se decide por intuición. Se decide con el conjunto de evaluación de §7.3, comparando **costo por plan completado y aceptado**, tasa de rechazo de las guardias y latencia. Se elige la configuración más barata que cumpla el umbral de calidad.

### 4.5 Capa de abstracción de proveedores

**Modelos.** `LlmClient` ya existe en `src/lib/ai/client.ts` y permite inyectar un cliente falso. Se amplía:

```ts
interface ProveedorLLM {
  id: string;                                   // "anthropic"
  extraer<T>(p: PeticionExtraccion<T>): Promise<Resultado<T> | null>;   // una llamada, salida validada
  conversar(p: PeticionDirector): AsyncIterable<EventoDirector>;        // bucle de herramientas en flujo
}
interface PoliticaModelos {                     // único lugar donde se nombran modelos
  intencion: string; importar: string; reportes: string;
  director: string; directorDificil: string; revision: string;
}
```

Los ids de modelo viven en un solo archivo de política, configurable por variables de entorno. Cambiar de modelo o de proveedor no toca ni el motor ni las pantallas.

**Datos.** Una interfaz por función, con una implementación actual y espacio para otra:

| Interfaz | Implementación actual | Método principal |
|---|---|---|
| `ProveedorGeocodificacion` | Nominatim u Open-Meteo Geocoding | `resolver(texto)` |
| `ProveedorLugares` | Nominatim (`places.ts`, `resolve.ts`) | `buscar(ciudad, tipo)`, `ubicar(nombre, ciudad)` |
| `ProveedorRutas` | OSRM FOSSGIS (`routing.ts`) | `matriz(puntos, modo)` |
| `ProveedorClima` | Open-Meteo (`weather.ts`) | `porHora(lat, lon, fecha)` |
| `ProveedorMedios` | Wikipedia (`media.ts`) | `resumen(etiqueta)` |
| `ProveedorAvisos` | FCDO, USGS, GDACS (`sources/*`) | `paraPais(codigo)`, `cercaDe(punto)` |
| `ProveedorReportes` | Supabase (`pulsemesh/store.ts`) | `vigentes(ciudad, lugar?)` |
| `ProveedorPrecios` | **Ninguna.** Implementación nula que devuelve `sin_dato` | `vuelo(origen, destino, fechas)` |

Todas devuelven `Dato<T>` y todas declaran en un catálogo (`src/lib/sources/catalog.ts`, ampliado) su licencia, vigencia, límite de uso y estrategia ante fallos, como pide el Maestro §14.

### 4.6 Contratos de datos

```ts
type ClaseDato = "oficial" | "proveedor" | "comunidad" | "historico" | "supuesto" | "sin_dato";

interface Dato<T> {
  valor: T | null;                 // null ⇔ clase "sin_dato"
  clase: ClaseDato;
  fuente: string | null;           // id del catálogo de fuentes
  observado: string | null;        // ISO; cuándo se consultó o se observó
  vence: string | null;            // ISO; después pasa a «desactualizado»
  crudo?: string;                  // texto original (p. ej. opening_hours)
}

interface Ciudad { id: string; nombre: string; pais: string; codigoPais: string;
  centro: Punto; zonaHoraria: string; cobertura: Cobertura | null }

interface Cobertura { porTipo: Record<TipoLugar, { total: number; conHorario: number }>; medido: string }

interface Lugar { id: string;           // "node/123" de OSM
  nombre: string; tipo: TipoLugar; punto: Punto; bajoTecho: boolean;
  horario: Dato<HorarioInterpretado>; sitioWeb: string | null; wikipedia: string | null }

interface Parada { id: string; lugar: Lugar; inicioMin: number; finMin: number;
  duracion: Dato<number>;               // clase "supuesto" salvo que la fije la persona
  traslado: Dato<{ minutos: number; modo: "pie" | "auto" }>;
  estado: "abierto" | "sin_confirmar";
  cierraMin: number | null; lluviaEnVisita: boolean; lluviaEnTraslado: boolean;
  fijadaPorPersona: boolean; motivos: string[]; alternativas: Alternativa[];
  costo: Dato<{ monto: number; moneda: string }> }

interface Dia { fecha: string; inicioMin: number; finMin: number; origen: Punto & { nombre: string };
  paradas: Parada[]; sinUbicar: { deseo: Deseo; motivo: string }[];
  clima: Dato<ClimaHora[]>; atardecerMin: Dato<number> }

interface Viaje { id: string; ciudad: Ciudad; desde: string; hasta: string; viajeros: number;
  ritmo: "tranquilo" | "equilibrado" | "intenso"; deseos: Deseo[]; dias: Dia[];
  version: number; supuestos: string[]; fuentes: EstadoFuente[]; generado: string }

type Operacion =
  | { tipo: "quitar"; paradaId: string } | { tipo: "agregar"; dia: string; deseo: Deseo }
  | { tipo: "mover"; paradaId: string; a: "antes" | "despues" | { dia: string } }
  | { tipo: "cambiar_por"; paradaId: string; lugarId: string }
  | { tipo: "fijar_hora"; paradaId: string; inicioMin: number }
  | { tipo: "cambiar_duracion"; paradaId: string; minutos: number }
  | { tipo: "cambiar_ventana_del_dia"; dia: string; inicioMin: number; finMin: number }
  | { tipo: "cambiar_origen"; dia: string; origen: Punto & { nombre: string } }
  | { tipo: "techo_por_lluvia"; dia: string };

interface Hallazgo { paradaId: string | null; gravedad: "bloquea" | "avisa" | "informa";
  codigo: string; texto: string; hechos: string[] }

interface Propuesta { id: string; viajeId: string; baseVersion: number; origen: Disparador;
  operaciones: Operacion[]; resultado: Viaje; diferencia: Diferencia; hallazgos: Hallazgo[];
  mensaje: string; mensajeDe: "ia" | "plantilla" }

interface Diferencia { entran: string[]; salen: string[];
  cambianHora: { paradaId: string; antes: number; despues: number }[];
  pasanASinConfirmar: string[]; consecuencias: string[] }

type Disparador = { tipo: "persona"; texto?: string } | { tipo: "lluvia"; desde: number; hasta: number }
  | { tipo: "horario"; paradaId: string } | { tipo: "reporte"; reporteId: string }
  | { tipo: "aviso_oficial"; fuente: string };
```

Persistencia: un `Viaje` con su historial cabe en `user_trips` (`0004`), que ya guarda `trip`, `activities`, `plan` e `history` como JSON. Se necesita una migración `0006` que adapte la forma o agregue una columna de versión de esquema, más un convertidor único para los viajes ya guardados en el dispositivo (claves `travel-pulse.trip-twin.v1` y `travel-pulse.city-workspaces.v1`).

### 4.7 Observabilidad de costo

Lo que hay (`telemetry.ts`): anillo en memoria, gasto mensual por proceso, corte al 100 % para lo no esencial y freno al 150 %.

Lo que falta y se diseña:

| Necesidad | Diseño |
|---|---|
| Tarifas correctas | Reemplazar los valores «PLACEHOLDER». Tarifas indicadas por el dueño: Fable 5.2 a 8 y 40 USD por millón de tokens, Haiku 5.5 a 0,10 y 0,50. Para Opus 5.5 y Sonnet 5.5 la referencia consultada indica 4 y 20, y 2 y 10; **confirmar contra la lista de precios oficial** antes de usarlas. Tabla en un archivo de configuración con su fecha de revisión. |
| Tokens de caché | Registrar también `cache_read_input_tokens` y `cache_creation_input_tokens`, que tienen otra tarifa. |
| Costo por usuario y por función | Tabla `ai_calls` (migración nueva): fecha, función, modelo, tokens, costo, resultado, guardia que falló, id de viaje e identificador de usuario seudonimizado. El costo por usuario y por función es una consulta. |
| Gasto global | `seedMonthlySpend` ya existe para sembrar el gasto desde un almacén persistente; se conecta a `ai_calls`. |
| Límite por persona | Tope diario de turnos del Director por usuario o por IP, sobre `limitOr429`. |
| Costo por resultado | Métrica principal: **costo por plan aceptado** = gasto de IA de un viaje ÷ 1 si la persona aplicó o guardó el plan. Se compara por configuración de modelos. |

**No se estima aquí un costo por usuario.** No hay tráfico ni llamadas reales con las que medirlo. Se medirá así: en la Fase 4, con la clave del dueño, se ejecuta el conjunto de evaluación y se registran tokens reales por tarea; después, con uso real, se lee `ai_calls`. El informe mostrará la mediana y el percentil 95 por función.

### 4.8 Caché, límites y degradación

**Caché en dos niveles.** Memoria del proceso (como hoy) y, cuando Supabase esté conectado, una tabla `source_cache` con clave, contenido, hora de consulta y vencimiento. La caché nunca borra la fecha original del dato: un dato servido de caché muestra cuándo se consultó de verdad.

| Fuente | Vigencia de caché | Límite conocido | Si falla |
|---|---|---|---|
| Nominatim (lugares) | 6 h en memoria (actual); 7 días persistente para lugares y horarios | 1 consulta por segundo, sin uso intensivo (política pública; por verificar) | Se usa la caché vencida con etiqueta «desactualizado»; sin caché, «No pudimos consultar el mapa» |
| OSRM FOSSGIS | 24 h por par de puntos | Uso razonable; servidor comunitario (por verificar) | «Sin dato de traslado: reservamos 30 min» (actual) |
| Open-Meteo (pronóstico) | 1 h por ciudad y fecha | **Límite diario** del plan gratuito, y uso gratuito restringido a fines no comerciales (por verificar antes de monetizar) | «No evaluamos la lluvia» |
| Wikipedia | 7 días | Uso razonable con identificación | Sin foto |
| FCDO, USGS, GDACS | 6 h, 10 min, 15 min (actual) | — | Último dato bueno, rotulado (actual) |
| Teselas del mapa (`tile.openstreetmap.org`) | Navegador | La política de teselas de OSM no admite uso intensivo (por verificar) | Lista sin mapa |
| Anthropic | Caché de instrucciones y de respuestas idénticas | Presupuesto mensual y tope por persona | Camino determinista |

**Límites propios.**
- Por IP y por usuario en cada ruta de API (`limitOr429`, hoy 20 por hora por defecto).
- Un máximo de consultas a Nominatim por plan. Hoy `computeDayPlan` hace una consulta por tipo de lugar; un viaje de varios días reutiliza los candidatos entre días en vez de repetirlas.
- Cola en el servidor para Nominatim, de modo que dos personas a la vez no superen una consulta por segundo. Hoy la pausa es por proceso.

**Degradación.** Cada proveedor devuelve `Dato` con `sin_dato` y un motivo cuando falla, en vez de lanzar un error hasta la pantalla. El plan se arma con lo disponible y `fuentes[]` informa el estado de cada una, como ya hace `computeDayPlan` con `warnings` y `sources`. Sin IA, toda la aplicación sigue funcionando con formularios y botones.

---

## 5. Datos

### 5.1 Catálogo por función

| Función | Fuente | Estado | Límite conocido |
|---|---|---|---|
| Aviso oficial por país | FCDO (GOV.UK) | **Verificado** (14 de 14 países, según el catálogo) | Un solo gobierno; solo 14 países de la base |
| Sismos | USGS | **Verificado** | Informativo |
| Ciclones, inundaciones, volcanes, incendios | GDACS | **Verificado** | Términos por revisar |
| Clima histórico mensual | Open-Meteo ERA5 | **Verificado** (30 destinos) | Solo los 30 de la base |
| Pronóstico por hora, atardecer | Open-Meteo | **Verificado** | Unos 15 días; límite diario |
| Lugares y coordenadas | Nominatim / OSM | **Verificado** | Resultados que varían entre llamadas; política de uso |
| Horario de apertura | Etiqueta `opening_hours` de OSM | **Verificado, cobertura parcial**: museos cerca de 50 %, restaurantes y pubs cerca de 15 % (São Paulo) | Sin feriados; lo no interpretable queda sin confirmar |
| Traslados a pie y en auto | OSRM FOSSGIS | **Verificado** | Sin tráfico; sin transporte público |
| Foto y descripción | Wikipedia / Wikimedia | **Verificado** | Solo lugares con artículo |
| Tendencia de interés | Wikimedia Pageviews | **Verificado** (29 de 30) | Interés, no reservas |
| Geocodificación de ciudades | Open-Meteo Geocoding (`/api/live-data`) o Nominatim | En uso; **sin verificación documentada** | — |
| Listado amplio de lugares por zona | Overpass | **No responde** desde el entorno de desarrollo | No se usa |
| Reportes de viajeros | PulseMesh (Supabase) | Base verificada en local; **sin conectar** | Vacío hasta tener comunidad |
| Precio de vuelos | — | **Sin fuente** | §5.3 |
| Costo diario, entradas, comidas | — | **Sin fuente** | Solo «precio que pagué» de viajeros |
| Transporte público | — | **Sin fuente** | Fuera de alcance por ahora |
| Eventos (conciertos, deportes) | — | **Sin fuente** | Fuera de alcance |
| Aforo o disponibilidad | — | **Sin fuente** | Solo reportes de viajeros |
| Saturación turística, conectividad aérea | — | **Sin fuente** | El motor los declara sin dato |

### 5.2 De 3 ciudades a cualquier ciudad

Hoy el itinerario solo acepta las claves de `CITIES` (`src/lib/day/cities.ts`) y los esquemas de `service.ts` y `verify/service.ts` rechazan el resto. El plan:

1. **Resolver la ciudad por texto.** Una herramienta de geocodificación devuelve candidatos con país, región, coordenadas y zona horaria. Si hay más de uno, la persona elige. El identificador estable es el del objeto de OSM, no un nombre escrito a mano.
2. **Punto de partida.** Por defecto, el centro que devuelve el geocodificador. La persona puede escribir su alojamiento o tocar el mapa. Los `anchorName` fijos («Av. Paulista») desaparecen.
3. **Consultas neutras al idioma.** `KIND_META.queries` ya usa términos en inglés y agrega uno en portugués para las galerías de São Paulo. Se generaliza: consulta por categoría de OSM y, si la ciudad lo requiere, un término en el idioma local tomado del código de país. Cada ciudad nueva puede revelar sorpresas como la de São Paulo; por eso existe el paso 4.
4. **Medidor de cobertura por ciudad.** Al armar el primer plan en una ciudad se mide y se guarda cuántos lugares por tipo tienen horario interpretable. Se muestra tal cual: «Restaurantes con horario: 3 de 20». La app no promete la misma calidad en todas partes.
5. **Tres niveles declarados:**
   - **Ciudad probada:** existe una grabación real y una prueba E2E (hoy: São Paulo; Santiago y Valparaíso por grabar).
   - **Ciudad cubierta:** sin grabación, pero con cobertura medida aceptable.
   - **Ciudad con poca información:** el plan se arma, con un aviso visible.
6. **PulseMesh sigue por piloto.** Abrir cualquier ciudad para el itinerario no abre los reportes en todas. `PILOT_CITIES` se mantiene hasta tener moderación.
7. **Carga sobre las fuentes.** Más ciudades significan más consultas a un servicio comunitario. Antes de abrir «cualquier ciudad» al público hay que decidir entre caché persistente con uso moderado, una instancia propia de Nominatim y OSRM, o un proveedor de pago. Es una de las preguntas abiertas (§9).

### 5.3 Precios: decisión abierta

**Hecho:** no hay fuente de precios. Amadeus Self-Service cerró el 17 de julio de 2026. Travelpayouts y Duffel no están verificados. No se supone ninguno.

| Opción | Qué daría | Qué no se sabe | Costo o compromiso |
|---|---|---|---|
| **A. Lanzar sin precios** | Producto honesto y completo en lo que sí sabe | — | Ninguno. El comparador queda sin la dimensión más pedida. |
| **B. Travelpayouts / Aviasales** | Precios de vuelo en caché de búsquedas de otros usuarios | Cobertura desde Santiago, antigüedad real de cada precio, condiciones para mostrarlos | Cuenta de afiliado; sin verificar |
| **C. Duffel** | Búsqueda de vuelos en tiempo real | Cobertura de aerolíneas de Latinoamérica, costo por búsqueda | Pago por uso; sin verificar |
| **D. Precios de viajeros** | Entradas y comidas: «precio que pagué» (ya existe `precio_observado`) | Volumen; depende de la comunidad | Ninguno; no sirve para vuelos |
| **E. Precios escritos por la persona** | Presupuesto y costos «dados por ti» | — | Ninguno; no es una fuente, es una nota |

D y E no excluyen a las demás y se construyen en cualquier caso.

**Criterio para decidir entre A, B y C.** Antes de integrar, una prueba con rutas reales, definida así:
1. Un conjunto fijo de rutas desde Santiago hacia destinos de la base, en varias fechas.
2. Por cada proveedor se mide: porcentaje de rutas con precio; si cada precio trae fecha de observación; diferencia frente al precio visible en un buscador público el mismo día; si la licencia permite mostrar y guardar en caché; costo por consulta; y qué ocurre al alcanzar el límite.
3. Se acepta un proveedor solo si entrega la fecha de cada precio (sin fecha no se puede cumplir la regla del dueño), si la licencia permite mostrarlo y si la cobertura alcanza el umbral que el dueño fije.
4. Si ninguno cumple, se elige A y se dice en pantalla.

En la interfaz, un precio de proveedor se mostrará siempre como «desde X · visto el día D · puede haber cambiado», nunca como precio disponible.

---

## 6. PulseMesh en cada parada

### 6.1 Qué cambia

Hoy `PulseMeshPanel` muestra reportes de la ciudad completa en un panel lateral de `/dia`, y la tabla `pulse_signals` no sabe a qué lugar se refiere un reporte. El diseño:

1. **Migración `0006`:** agregar a `pulse_signals` las columnas `place_ref` (identificador de OSM del lugar, opcional) y `place_name`, con un índice por `(city_key, place_ref)`, y exponerlas en `pulse_signals_public`. El lugar es un sitio público; no es la ubicación del viajero.
2. **Línea de viajeros en cada parada**, siempre presente, en una de cuatro formas:

| Situación | Texto |
|---|---|
| Sin reportes | «Aún no hay reportes de viajeros aquí.» |
| Uno, sin corroborar | «Fila larga · 1 viajero · hace 40 min · por confirmar» |
| Corroborado | «Cerrado por obras · 3 viajeros · hoy 11:20» |
| En disputa | «¿Cerrado? 2 dicen que sí, 3 que no» |

3. **Hoja de la parada** con el detalle y las acciones (pantalla 7).
4. **Reportes de zona:** los que no tienen lugar pero están a menos de un kilómetro (la precisión que guarda la base) aparecen en el contexto del día, no en la tarjeta.

### 6.2 Cómo afecta al plan

| Estado del reporte | Efecto |
|---|---|
| `por_confirmar` (1 persona) | Nota visible en la parada. **No** genera propuesta ni cambia sellos. |
| `corroborada` (3 o más personas distintas) y de tipo «cerrado», «acceso cortado» o «fila larga» | Genera un aviso con propuesta de ajuste, que la persona aprueba o ignora. |
| `en_disputa` | Nota visible. Sin efecto. |
| Precio observado | Se muestra en la parada como «un viajero pagó X · hace N días». No entra a ningún total. |

Un reporte **nunca** modifica el dato del proveedor. Si OSM dice «abierto hasta las 20:00» y tres viajeros dicen «cerrado», se muestran ambos, cada uno con su sello. El número de reportes no se presenta como certeza (Maestro §16).

### 6.3 Arranque sin comunidad

- **Se dice la verdad.** Sin reportes, la línea dice que no hay. No hay ejemplos, ni contadores, ni un mapa «activo».
- **La sección no se promociona vacía.** Mientras Supabase no esté conectado, no se muestra el formulario; la franja «Qué sabemos y qué no» lo explica.
- **Se pide en el momento justo.** Al pasar la hora de fin de una parada del modo «Hoy», aparece una sola pregunta de un toque: «¿Estaba abierto?» (Sí · No · No fui). Es opcional y se puede desactivar para siempre.
- **El primer valor es personal.** Lo que la persona responde queda en su propio viaje como nota («Fuiste: estaba abierto»), aunque nadie más lo vea. Así reportar sirve desde el primer usuario.
- **Piloto pequeño y real.** Tres ciudades y personas invitadas por el dueño. El éxito se mide como proporción de paradas visitadas con al menos un reporte, no como volumen.
- **Sin siembra.** No se generan reportes con IA ni se importan reseñas de terceros como si fueran reportes.

### 6.4 Moderación

| Riesgo | Control existente | Control por agregar |
|---|---|---|
| Reporte falso u ofensivo | Marcas (`pulse_flags`) y ocultamiento automático (`pulse_after_flag`) | Cola de revisión para el dueño con las señales ocultas |
| Exceso de reportes | Límite diario en `pulse_before_signal` | Límite por lugar y por persona |
| Autoconfirmación | Una respuesta por persona; cuenta de personas distintas en la vista | — |
| Cuentas múltiples | — (pendiente en la matriz) | Antigüedad mínima de cuenta para que una confirmación cuente; revisión de patrones |
| Datos personales en el texto | Largo máximo | Revisión con Haiku antes de publicar: si detecta nombres, teléfonos o matrículas, pide corregir |
| Reportes viejos | Vigencia por categoría fijada por el servidor | — |
| Acusaciones de seguridad | La categoría seguridad está **fuera del piloto** | Se mantiene fuera hasta tener moderación humana |

### 6.5 Privacidad

- **Voluntario siempre.** Ninguna función exige reportar ni compartir ubicación.
- **Sin seguimiento.** No se usa la ubicación en segundo plano. El modo «Hoy» funciona con el reloj, no con GPS.
- **Ubicación mínima.** Un reporte se asocia al lugar público de la parada. Si se envían coordenadas, se redondean a cerca de 1 km (`roundCoord` y el tipo de la columna).
- **Sin identidad pública.** La vista pública no expone el `user_id`.
- **Borrado.** `delete_my_cloud_data` elimina viajes, DNA y reportes propios.
- **Lo que se envía a la IA.** Solo el texto necesario, tras `stripPII`. Se informa que el proveedor de IA retiene las peticiones por un periodo limitado.
- **Sin inferencias sensibles.** El DNA guarda solo lo declarado.

---

## 7. Plan de construcción

### 7.1 Fases

«Claude Code solo» significa que no requiere ninguna acción del dueño. Los criterios son comprobables con un comando o una captura.

#### Fase 0 — Limpieza y base (Claude Code solo)

Qué se hace: eliminar lo sintético y lo duplicado de §1.3 que no depende del motor nuevo; declarar Playwright y un script `e2e`; corregir la tabla de tarifas de IA; ampliar el catálogo de fuentes.

Criterios de aceptación:
- [ ] `grep -ri "synthetic\|sintétic\|demo" src/` no devuelve nada en código de producto.
- [ ] No existen `src/lib/trip-twin/demo.ts`, `src/lib/client/mock.ts`, `src/lib/signals/` ni `NEXT_PUBLIC_USE_MOCK`.
- [ ] La CSP no incluye `images.unsplash.com`.
- [ ] `npm ci && npm run typecheck && npm test && npm run build` pasan en limpio.
- [ ] `npm run e2e` existe y ejecuta los E2E vigentes.
- [ ] Ninguna tarifa de IA está rotulada «PLACEHOLDER».

#### Fase 1 — Carcasa y sistema de diseño (Claude Code solo)

Qué se hace: `AppShell`, tokens, componentes de §3.4, rutas nuevas con redirecciones.

Criterios:
- [ ] Una sola navegación en el código. No existen `DesktopNav`, `tt-sidebar` ni reglas `:has(` de escape en `globals.css`.
- [ ] `layout.tsx` no contiene `max-w-[430px]`.
- [ ] Un test falla si un componente contiene un color hexadecimal.
- [ ] Capturas de las 5 rutas a 390, 768 y 1280 px sin desplazamiento horizontal.
- [ ] Revisión de accesibilidad automática sin errores graves en las 5 rutas; navegación completa con teclado.
- [ ] Las rutas antiguas redirigen.

#### Fase 2 — Motor único e itinerario real (Claude Code solo; necesita salida a internet para grabar)

Qué se hace: `src/lib/plan/`, contratos de §4.6, `/viaje/[id]` con pantallas 3 y 4, varios días, guardar y deshacer, importar como entrada secundaria.

Criterios:
- [ ] `src/lib/day/planner.ts`, `src/lib/trip-twin/engine.ts` y `src/lib/verify/checks.ts` ya no existen o solo reexportan el motor.
- [ ] Prueba de propiedad: en 1 000 planes generados con datos grabados, ninguna parada con horario queda fuera de él.
- [ ] Prueba de mutación: quitar la comprobación de horario, de traslado o de lluvia hace fallar al menos una prueba.
- [ ] Un viaje de 3 días no repite lugares y respeta el ritmo.
- [ ] E2E: crear viaje, quitar una parada, cambiar otra, deshacer dos veces, rehacer, recargar. El estado se conserva.
- [ ] Un itinerario pegado produce un viaje editable con los mismos sellos que uno generado.
- [ ] Con cada fuente simulada como caída, la pantalla muestra el aviso correspondiente y el plan parcial.
- [ ] Todo número visible en la pantalla del itinerario tiene un sello. Lo comprueba un E2E que recorre el DOM.

#### Fase 3 — Cualquier ciudad y decisión de destino (Claude Code solo)

Qué se hace: geocodificación, medidor de cobertura, `/destinos` sin puntaje, comparador de 2 a 4.

Criterios:
- [ ] El itinerario funciona con una ciudad escrita que no está en `CITIES`. Prueba con grabaciones reales de al menos 5 ciudades de 3 países.
- [ ] Un nombre ambiguo muestra candidatos; nunca se elige en silencio.
- [ ] La cobertura mostrada coincide con un recuento independiente sobre la grabación.
- [ ] `/destinos` no muestra ningún puntaje mientras la confianza esté bajo el umbral, y lista lo que falta por destino.
- [ ] El comparador admite 4 destinos y marca «sin dato» donde corresponde.
- [ ] E2E de punta a punta sin IA: intención por formulario → destino → itinerario → modificar → deshacer.

#### Fase 4 — Director de IA (**necesita al dueño:** `ANTHROPIC_API_KEY` y presupuesto mensual)

Qué se hace: `src/lib/director/`, herramientas, guardias, política de modelos, registro de costo, conjunto de evaluación.

Criterios:
- [ ] Con cliente falso: las cuatro guardias rechazan una cifra inventada, un lugar inexistente, lenguaje prohibido y una salida fuera de esquema, y en los cuatro casos la persona recibe la plantilla.
- [ ] Con la clave real y el conjunto de evaluación: cero cifras no respaldadas en las respuestas mostradas.
- [ ] Sin clave, toda la aplicación funciona y dice que está en modo sin IA.
- [ ] Cada llamada queda registrada con función, modelo, tokens y costo.
- [ ] Informe de medición: costo y latencia por función, configuraciones A y B de §4.4, con recomendación.
- [ ] Al superar el presupuesto, las funciones no esenciales se cortan y la interfaz lo dice.
- [ ] Un texto con instrucciones maliciosas dentro de un nombre de lugar o de un itinerario pegado no altera el comportamiento.

#### Fase 5 — Nube y PulseMesh por parada (**necesita al dueño:** proyecto Supabase, aplicar `0001`–`0005` y la nueva `0006`, variables de entorno)

Qué se hace: conectar cuentas y sincronización, migración de lugar, línea de viajeros, hoja de reportes, cola de moderación, `ai_calls` y `source_cache`.

Criterios:
- [ ] Las comprobaciones de seguridad por fila ya escritas pasan contra el proyecto real, no solo en local.
- [ ] Dos cuentas reales: la segunda ve el reporte de la primera en la parada, lo confirma y el recuento sube; no puede confirmarse a sí misma.
- [ ] Tres confirmaciones distintas cambian el estado a corroborada y generan un aviso en un viaje que incluye ese lugar.
- [ ] Sin reportes, la parada dice exactamente «Aún no hay reportes de viajeros aquí».
- [ ] «Borrar todo» elimina viajes, DNA y reportes; se comprueba en la base.
- [ ] Un viaje creado en un dispositivo aparece en otro con su historial.

#### Fase 6 — Adaptación en vivo (Claude Code solo, tras las fases 2 y 5)

Qué se hace: `plan/disparadores.ts`, modo «Hoy», avisos y propuestas.

Criterios:
- [ ] Con dos grabaciones reales de pronóstico de la misma ciudad (sin lluvia y con lluvia), el cambio genera una propuesta solo para las paradas al aire libre afectadas.
- [ ] Ninguna propuesta se aplica sin un toque en «Aplicar». Aplicar crea una entrada en el historial y se puede deshacer.
- [ ] Un reporte sin corroborar no genera propuesta.
- [ ] «Revisado a las HH:MM» refleja la hora real de la última consulta exitosa.
- [ ] Con la pantalla abierta una hora, el número de consultas al pronóstico no supera el previsto por la caché.

#### Fase 7 — Precios (**necesita al dueño:** elegir proveedor y contratar)

Qué se hace: la prueba de §5.3 y, si un proveedor la supera, su integración tras `ProveedorPrecios`.

Criterios:
- [ ] Informe de la prueba con rutas reales por proveedor.
- [ ] Todo precio mostrado lleva fuente y fecha de observación.
- [ ] Con el proveedor caído, la pantalla dice «precio sin dato» y nada más cambia.
- [ ] Si no se elige proveedor, la fase se cierra como «sin precios» y queda escrito en la franja de fuentes.

#### Fase 8 — Producción (**necesita al dueño:** variables en Vercel o Railway, dominio, revisión de términos)

Criterios: los cuatro gates de §7.4 en verde, con evidencia.

### 7.2 Qué necesita al dueño

| Acción del dueño | Desbloquea | Sin ella |
|---|---|---|
| Entregar `ANTHROPIC_API_KEY` y fijar `AI_MONTHLY_BUDGET_USD` | Fase 4 | La app funciona con formularios y reglas; no hay texto libre inteligente ni Director |
| Crear o autorizar el proyecto Supabase y aplicar las migraciones `0001`–`0005` (y `0006`) | Fase 5 | Todo queda en el dispositivo; no hay reportes de viajeros ni caché compartida |
| Configurar variables en Vercel o Railway: `NEXT_PUBLIC_SUPABASE_URL`, la clave pública de Supabase, `ANTHROPIC_API_KEY`, `AI_MONTHLY_BUDGET_USD`, `RATE_LIMIT_PER_HOUR` | Fase 8 | No hay despliegue real |
| Elegir dónde se despliega | Fase 8 | Ver nota abajo |
| Elegir proveedor de precios, o decidir lanzar sin precios | Fase 7 | Se lanza sin precios |
| Decidir la estrategia de mapas a escala (uso moderado con caché, instancia propia o proveedor de pago) | Abrir «cualquier ciudad» al público | Se mantiene un uso reducido |
| Revisar y aceptar términos de GDACS, FCDO, Open-Meteo, Nominatim, OSRM y teselas de OSM | Gate C | No se puede declarar el gate C aprobado |
| Invitar a los primeros viajeros del piloto | §6.3 | PulseMesh permanece vacío, y así se muestra |
| Aprobar el aspecto visual con capturas | Gate B | Queda «parcial» |

**Nota sobre el despliegue.** El repositorio ya trae `railway.json` y la salida `standalone`. Un proceso de larga duración (Railway) conserva las cachés en memoria, respeta la pausa de Nominatim y permite respuestas en flujo largas. En una plataforma de funciones cortas, esas tres cosas dependen de la caché persistente y de una cola. Recomiendo Railway para esta etapa; la decisión es del dueño.

### 7.3 Pruebas

| Tipo | Qué cubre | Cómo |
|---|---|---|
| Unitarias | Motor, intérpretes, guardias | Vitest. Hoy: 471 pruebas que pasan. |
| Propiedad y mutación | Invariantes del motor | Generación de casos sobre datos grabados; mutaciones manuales documentadas, como ya se hizo con el planificador |
| **Datos reales grabados** | Que el código entiende las respuestas reales | Ya existen `src/lib/day/__fixtures__/*-real.json`, `src/lib/sources/__fixtures__/gdacs-real-sample.json` y `qa/fixtures/day-plan-real.json`. Se agrega un script que graba respuestas por ciudad y fecha, con la fecha en el nombre. Una grabación nunca se edita a mano. |
| Contrato de fuentes | Que la fuente no cambió de forma | Un comando de humo contra las fuentes reales, fuera de la integración continua, con informe fechado |
| E2E | Flujos completos en navegador | Playwright, a 390 y 1280 px, con la API respondida desde grabaciones reales. Flujos: (1) intención → destino → itinerario; (2) modificar → deshacer → rehacer → recargar; (3) lluvia → propuesta → aplicar → deshacer; (4) importar un plan; (5) reportar y confirmar con dos sesiones; (6) cada fuente caída; (7) sin IA |
| Sellos | Que ningún número aparezca sin fuente | E2E que recorre la pantalla y falla ante un número sin sello |
| Evaluación de IA | Calidad y costo del Director | Conjunto fijo de casos reales (peticiones de cambio, composiciones, textos ambiguos, intentos de inyección). Métricas: aceptación por las guardias, operaciones correctas, costo y latencia. Con cliente falso en integración continua; con clave real bajo demanda y con aprobación del gasto |
| Accesibilidad | Contraste, teclado, lectores | Revisión automática por ruta y recorrido manual con teclado |
| Visual | Coherencia y desbordes | Capturas por ruta y tamaño, guardadas en `docs/evidence/` |
| Seguridad de datos | Aislamiento por usuario | Las comprobaciones existentes de `0004` y `0005`, repetidas contra el proyecto real |

### 7.4 Gates del Maestro

| Gate | Estado según la matriz del 31-oct | Qué lo cierra en este plan |
|---|---|---|
| **A. Base técnica** | Aprobado | Se mantiene en cada fase. Fase 0 agrega los E2E reproducibles. |
| **B. Experiencia** | Parcial | Fases 1–3: una navegación, 5 rutas, capturas en tres tamaños, accesibilidad, flujo completo. Aprobación visual del dueño. |
| **C. Datos y confianza** | Pendiente | Fase 0 (nada sintético), fases 2–3 (sellos en todo), fase 5 (privacidad comprobada), revisión de términos por el dueño. |
| **D. Producción** | Pendiente | Fase 8: seguridad revisada, registro de errores y de costo, respaldo de la base, vuelta atrás documentada y probada, guía operativa. |

No se declara el producto terminado mientras un gate esté abierto.

### 7.5 Métrica norte y cómo se mide

**Viajes planificados con éxito y considerados útiles.** Un viaje cuenta cuando: (1) tiene al menos un día con paradas, (2) fue guardado, y (3) la persona respondió «sí» a «¿Te sirvió el plan?» después de la fecha. Métricas de apoyo: proporción de intenciones que llegan a itinerario, itinerarios modificados, propuestas aplicadas frente a ignoradas, cambios deshechos y paradas con reporte. Requiere un registro de eventos sin datos personales; hasta la Fase 5 solo puede contarse en el dispositivo.

---

## 8. Riesgos y lo que no se hará

### 8.1 Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| **Horarios escasos en OSM** (cerca de 15 % en restaurantes y pubs) | Muchos «sin confirmar»: el plan parece débil | Decirlo con el medidor; enlazar al sitio oficial; reportes de viajeros; evaluar un proveedor de lugares de pago como decisión futura |
| **Dependencia de servicios comunitarios** (Nominatim, OSRM, teselas) | Bloqueo por exceso de uso al crecer | Caché persistente, cola, tope por plan; decisión del dueño sobre instancia propia o proveedor |
| **Licencia y límite de Open-Meteo** | Corte del clima o incumplimiento al monetizar | Caché por ciudad y día; verificar términos antes de cobrar |
| **Sin precios** | El comparador pierde su dimensión más pedida | Decirlo; prueba de proveedores; precios de viajeros para entradas y comidas |
| **La IA inventa** | Rompe la regla central del producto | Cuatro guardias, libro de hechos, plantilla de respaldo, evaluación con cero tolerancia |
| **Costo de IA** | Gasto imprevisible | Presupuesto con corte, tope por persona, medición por función antes de abrir, modelo económico por defecto |
| **Turnos lentos del modelo más capaz** | Espera larga al componer | Respuesta en flujo con progreso; el motor entrega el plan aunque el texto tarde |
| **PulseMesh vacío** | Promesa incumplida | No se promociona vacío; valor personal desde el primer uso; piloto pequeño |
| **Reportes falsos coordinados** | Cierre falso de un lugar | Corroboración de 3 personas, antigüedad de cuenta, el reporte nunca altera el dato del proveedor, seguridad fuera del piloto |
| **Migrar a un solo motor rompe lo que funciona** | Regresiones | Se conservan las 471 pruebas; el motor nuevo debe pasar las de `planner`, `engine` y `checks` antes de borrar los antiguos |
| **Un solo gobierno como fuente de avisos** | Sesgo o vacío para viajeros de otros países | Se rotula «según el Reino Unido»; sumar otra fuente oficial más adelante |
| **Resultados de Nominatim que varían entre llamadas** | El plan cambia al regenerar | Caché persistente por ciudad y tipo; las paradas ya elegidas quedan fijadas en el viaje |
| **Sin tráfico ni transporte público** | Traslados en auto optimistas | Siempre rotulado «sin tráfico»; margen configurable |
| **Feriados y cierres extraordinarios** | «Abierto» que no lo está | Aviso en fechas señaladas; reportes de viajeros; no se promete |

### 8.2 Lo que no se hará, y por qué

| No se hará | Motivo |
|---|---|
| Mostrar precios, tiempos de fila, aforo o eventos sin fuente | Regla del dueño: nada inventado |
| Publicar un puntaje de destino con menos del 40 % de cobertura | El motor ya lo prohíbe; un número débil engaña más que su ausencia |
| Cambiar el plan automáticamente | Maestro §6: mostrar las diferencias antes de aplicar. La persona decide. |
| Seguimiento de ubicación, notificaciones push o procesos en segundo plano | Privacidad y regla «sin vigilancia». Se reevaluará cuando haya consentimiento explícito y una necesidad demostrada |
| Reservas y pagos | No hay proveedor ni se validó la demanda. La afiliación existente queda como está |
| Un chat generalista de viajes | El Maestro lo descarta expresamente. El campo de texto opera sobre el viaje, con herramientas |
| Importar reseñas o extraer contenido de otros sitios | Maestro §14: no infringir términos de uso; y no son observaciones propias |
| Reportes de seguridad de viajeros | Sin moderación humana, es el mayor riesgo de daño y de discriminación |
| Aplicación nativa | La web adaptable e instalable cubre el caso; duplicaría el trabajo |
| Módulos 14 a 20 del Maestro (Hidden Gems, Traveler Radar, Travelers Like You, Living Routes, Passport, Economy, servicio de inteligencia) | Maestro §8: no construir los veinte a la vez. Dependen de una comunidad que aún no existe |
| Auditar itinerarios de otros asistentes como producto principal | Regla del dueño. Queda como entrada secundaria |
| Reescribir desde cero | Maestro, Fase 0. Lo real del repositorio se conserva y se consolida |
| Generar fotos o usar fotos genéricas | Una imagen que no es del lugar es un dato falso |

---

## 9. Preguntas abiertas para el dueño

1. **Precios.** ¿Lanzamos sin precios, o autorizas la prueba con rutas reales de Travelpayouts y Duffel (§5.3)? Si es lo segundo, ¿qué cobertura mínima aceptas y cuánto estás dispuesto a pagar por consulta?
2. **Mapas a escala.** Abrir «cualquier ciudad» depende de servicios comunitarios con límites de uso. ¿Uso moderado con caché (gratis, con riesgo de bloqueo), instancia propia (costo de servidor) o proveedor de pago (costo por consulta y, posiblemente, mejores horarios)?
3. **IA: presupuesto y modelo por defecto.** ¿Cuál es el presupuesto mensual, y aceptas que el modelo del Director se elija midiendo costo por plan aceptado (§4.4) en lugar de fijar hoy el más capaz? Incluye aceptar que el proveedor retiene las peticiones por un periodo limitado.

Preguntas menores: plataforma de despliegue (recomiendo Railway); si los 30 destinos editoriales bastan para el descubrimiento inicial; a quién invitar al piloto de reportes; nombre definitivo en pantalla para la compatibilidad de destino cuando haya cobertura suficiente.

---

## Anexo — Referencias verificadas

Rutas del repositorio citadas en este documento y comprobadas con `ls` y `grep` el 12 de noviembre de 2026:

- Planificación: `src/lib/day/planner.ts`, `service.ts`, `places.ts`, `openingHours.ts`, `routing.ts`, `weather.ts`, `media.ts`, `cities.ts`, `query.ts`.
- Trip Twin: `src/lib/trip-twin/engine.ts`, `types.ts`, `history.ts`, `demo.ts`, `assistant.ts`, `import.ts`, `budget.ts`, `city-workspace.ts`.
- Verificación: `src/lib/verify/service.ts`, `checks.ts`, `resolve.ts`.
- IA: `src/lib/ai/client.ts`, `telemetry.ts`, `guard.ts`, `interpret.ts`, `critic.ts`, `verdict.ts`, `explain.ts`.
- Señales y reportes: `src/lib/signals/engine.ts`, `trip-link.ts`, `types.ts`; `src/lib/pulsemesh/model.ts`, `store.ts`.
- Fuentes: `src/lib/sources/http.ts`, `catalog.ts`, `fcdo.ts`, `usgs.ts`, `gdacs.ts`, `live.ts`, `overlay.ts`.
- Motor de destinos y datos: `src/lib/engine/*`, `src/lib/types.ts`, `src/lib/data/seed/real.generated.json`.
- Nube y cliente: `src/lib/cloud/*`, `src/lib/client/dna-core.ts`, `api.ts`, `mock.ts`, `src/lib/server/http.ts`.
- Interfaz: `src/app/layout.tsx`, `globals.css`, `page.tsx`, `trip-twin/page.tsx`, `trip-twin/trip-twin.css`, `api/live-data/route.ts`, `api/signals/route.ts`; `src/components/day/DayView.tsx`, `DayMap.tsx`, `screens/HomeView.tsx`, `screens/LiveView.tsx`, `PulseMeshPanel.tsx`, `StatePanels.tsx`, `ConfidenceBar.tsx`, `ui/BottomTabBar.tsx`, `lux/GlobeHero.tsx`.
- Base de datos: `supabase/migrations/0001_init.sql` a `0005_pulsemesh.sql`.
- Pruebas y despliegue: `qa/e2e-*.js`, `qa/fixtures/day-plan-real.json`, `src/lib/day/__fixtures__/`, `src/lib/sources/__fixtures__/gdacs-real-sample.json`, `railway.json`, `next.config.ts`, `package.json`.

Todo lo que este documento nombra bajo `src/lib/plan/`, `src/lib/director/`, `src/lib/providers/`, `src/lib/obs/`, la migración `0006`, las tablas `ai_calls` y `source_cache` y los componentes de §3.4 marcados como nuevos **no existe todavía**: es diseño.
