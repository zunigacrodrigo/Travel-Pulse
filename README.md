# Travel Pulse

Plataforma de exploración y planificación de viajes en evolución. El motor de destinos usa datos de referencia y no entrega cotizaciones de vuelo en vivo.

## Qué incluye (las 14 funciones de V1)

| Función | Dónde |
|---|---|
| Home con globo y formulario | `/` |
| Decision Engine, Top 5, Opportunity Score, score explicable, confianza | `/resultados`, `src/lib/engine` |
| Reality Check | `/destino/[id]` |
| Comparación | `/comparar` |
| Send Me Somewhere | `/sorpresa` |
| Guardar y compartir (imagen 9:16) | `/guardados`, `/api/share/[id]` |
| Clic de salida a afiliado, con registro | `/api/clicks` |
| Feedback Founding Explorers y Expectation Gap | `/feedback/[id]/antes`, `/durante`, `/despues` |

Estados: carga, error, sin resultados, información limitada (confianza < 40%), límite de consultas. Modo claro y oscuro.

## Arquitectura

```
src/lib/types.ts     Contratos compartidos (fuente de verdad)
src/lib/engine/      Motor determinista: 8 factores, confianza, filtros, Reality Check, comparación, sorpresa, gap
src/lib/data/        30 destinos curados con fuente y fecha; repositorio en memoria o Supabase
src/lib/ai/          Veredicto (Haiku 5.5), revisor crítico (Sonnet 5.5), respaldo sin IA, presupuesto y caché
src/lib/server/      Validación, límite de tasa, utilidades HTTP
src/app/api/         Route handlers
src/app, components  Interfaz (Next.js App Router, Tailwind v4)
supabase/            Migraciones con RLS, vista del gap (n ≥ 10), seed
```

La IA nunca inventa cifras: los números salen del motor; el texto pasa un chequeo numérico y un revisor crítico, y si falla se muestra el resumen generado desde el desglose.

## Correr en local

```bash
npm ci
npm run dev          # http://localhost:3000
npm test             # 180+ pruebas
npm run coverage     # cobertura del motor (meta 90%)
```

Sin variables de entorno funciona con datos curados de demostración. Ver `.env.example` para activar Supabase, Anthropic y afiliados.

## Desplegar en Railway

`railway.json` ya define build, arranque (`npm run start:prod`, salida standalone) y healthcheck en `/api/health`. Conecta el repositorio a un servicio de Railway, genera un dominio y agrega las variables que quieras activar.

## Pendiente antes de producción real

- Clima y lugares se consultan desde Open-Meteo y OpenStreetMap/Overpass en `/live`. Las tarifas no están conectadas a Amadeus: el motor usa estimaciones internas de un dataset sintético.
- Login con Supabase Auth para guardar viajes entre dispositivos (hoy se guardan en el navegador).
- Analítica (PostHog) y errores (Sentry).
- Revisión de datos curados por dos personas, como pide el documento.


## Trip Twin experimental (V1.1)

Se agregó un primer módulo para construir y recalcular itinerarios sin modificar el Decision Engine existente.

- Interfaz: `/trip-twin` (enlace desde Home).
- API stateless: `POST /api/trip-twin`.
- Motor determinista: `src/lib/trip-twin/engine.ts`.
- Contratos y validación Zod: `src/lib/trip-twin/types.ts`.
- Pruebas unitarias: `src/lib/trip-twin/engine.test.ts`.
- Datos demo: `src/lib/trip-twin/demo.ts`.

**Limitaciones conocidas:** el prototipo usa datos sintéticos, no consulta horarios, precios ni rutas de transporte reales. El endpoint calcula una respuesta, pero no implementa autenticación ni sincronización del plan con Supabase. La UI es una demostración, no debe usarse para tomar decisiones de viaje reales.

Para ejecutar localmente con las dependencias instaladas:

```bash
npm ci
npm run dev
# abrir http://localhost:3000/trip-twin
npm test -- src/lib/trip-twin/engine.test.ts
npm run typecheck
```

## Rediseño visual v1.6 — Trip Twin

La pantalla `/trip-twin` conserva el estilo azul nocturno, adapta la navegación para móvil e incorpora un mapa interactivo embebido de OpenStreetMap. Seleccionar una actividad centra el mapa; desde allí se puede ampliar o abrir el mapa completo. La atribución la muestra el mapa de OSM.

Las actividades que se añaden desde las sugerencias y el plan resultante se guardan en `localStorage` de este navegador. No se sincronizan entre dispositivos. Lugares, horarios, precios y traslados de Trip Twin son demostrativos o incompletos; el texto de interfaz identifica esa limitación. El mapa requiere conexión a internet y sus condiciones de uso dependen del proveedor OpenStreetMap. El chat de Trip Twin ahora interpreta de forma acotada solicitudes para retirar o retrasar una actividad y cambiar el presupuesto. Sin `ANTHROPIC_API_KEY` aplica reglas locales; con clave puede usar Anthropic para interpretar, y el motor determinista calcula la vista previa.

## Auditoría independiente y ajuste a Travel Pulse 2.0 (28-10-2026)

La propuesta visual adjunta plantea un producto **city-first**: buscar una ciudad, consultar su pulso actual y sus fuentes, adaptar un itinerario y reportar observaciones con estados honestos. El producto que existe hoy sigue siendo principalmente un **motor para elegir destinos**. Hay módulos que se pueden reutilizar, pero no es aún una implementación de Travel Pulse 2.0.

### Correspondencia módulo por módulo

| Propuesta 2.0 | Estado en el proyecto | Cómo adaptarlo |
|---|---|---|
| Explorar: buscar ciudad y cobertura | La portada `/` ahora inicia por ciudad-país, con enlaces directos a World Monitor/Pulso, Mi viaje y descubrimiento de destinos. Las fuentes disponibles y los límites de esta beta se explican antes de abrir resultados. | La cobertura por ciudad aún depende de Open-Meteo y Overpass; faltan sensores humanos sincronizados y una vista geográfica de reportes. |
| Pulso de ciudad: contexto del día + mapa | `/live` consulta Open-Meteo y OSM/Overpass. El mapa geográfico de ciudad es un iframe real de OSM con puntos numerados aproximados para lugares; el mapa inferior de reportes sigue esquemático y no ubica señales de viajeros. | Si se conecta la comunidad, geolocalizar reportes solo con consentimiento y mostrarlos en el mapa geográfico con vigencia, fuente, corroboración y estado claramente diferenciados. |
| Clima y lugares | Conectados desde `/api/live-data`; el clima es un modelo meteorológico. OSM aporta objetos mapeados, no confirma apertura, horarios, afluencia, seguridad ni accesibilidad real. | Presentar fuente, hora de consulta, cobertura parcial y límites junto a cada dato. Ya no se etiqueta el módulo como “condiciones reales”; el indicador ahora dice “Clima conectado”. |
| Pulso de viajeros y reporte | `/live` permite filtrar, reportar y confirmar. Reportes y confirmaciones viven en `localStorage` en este dispositivo; no se comparten, revisan ni moderan en servidor. Los ejemplos están rotulados. | La base del formulario se adapta bien a la propuesta. Añadir sincronización, moderación, denuncia y reglas de caducidad antes de llamarlo comunidad global. “Foto” y “enlace” son declaraciones, no adjuntos: la interfaz ahora lo aclara y una foto declarada ya no aumenta la confianza. |
| Mi viaje: itinerario y alternativa | `/trip-twin` conserva reordenamiento e incidencias. En el flujo de ciudad consulta Open-Meteo y OSM, y ofrece alternativa por lluvia. El chat prepara vistas previas para cancelar, retrasar o cambiar presupuesto, con aprobación explícita; la interpretación IA requiere una clave y de lo contrario usa reglas locales. Horarios, precios y traslados siguen desconocidos si no tienen fuente. | Conectar una API de rutas y tarifas con licencia/costos claros; luego hacer que el contexto de señales comunitarias verificadas también pueda disparar propuestas. |
| Navegación inferior y Perfil | La portada presenta Mi viaje y “Encuentra un destino” como caminos distintos. La navegación existente aún conserva Buscar / Pulso / Sorpresa / Guardados y Trip Twin tiene navegación propia. No existe una sección Perfil. | Unificar navegación y dar a Mi viaje una pestaña principal cuando se actualice el shell global. Crear Perfil cuando haya preferencias y cuenta que administrar. |
| Estados honestos | La búsqueda climática tiene carga/error/sin resultados y la API retorna estados de proveedor y limitaciones. Pulsos ofrece etiquetas demo/local. | Extender estados por ciudad: cobertura baja, fuente caída, señal caducada y sin conexión. Evitar un único estado “fuentes conectadas” si solo responde una fuente. |
| Marca y responsive | La base visual actual es azul nocturno, pero varias rutas siguen en un marco de 430 px también en pantallas anchas; Sorpresa y Trip Twin usan layouts distintos. La propuesta ofrece un sistema city-first más coherente y vistas móviles específicas. | Adoptar tipografía, componentes y navegación de la propuesta en todas las rutas. Probar desktop ancho y móvil real antes de aprobar el rediseño completo. |

### Funciones conectadas y límites comprobados

- **Clima:** Open-Meteo responde en la prueba realizada para Santiago. Es información de modelo/consulta, no alerta oficial.
- **Mapa:** OpenStreetMap es un proveedor externo real. El encabezado CSP del proyecto bloqueaba el iframe de Trip Twin; se autorizó `www.openstreetmap.org` en `frame-src` y el iframe cargó con controles y atribución de OSM en la comprobación posterior. El mapa de Pulsos sigue siendo una ilustración esquemática.
- **Tráfico y seguridad:** no hay fuentes oficiales conectadas. Los reportes de esas categorías son aportes locales/de demo, no estado actual verificado.
- **IA:** las rutas de recomendación y explicación pueden usar Anthropic si está configurado; el chat de Trip Twin ahora admite interpretación estructurada opcional por Anthropic y tiene respaldo local. No hay clave configurada en esta copia, así que la IA externa no está activa. La tabla de precios de tokens en `src/lib/ai/telemetry.ts` está marcada como placeholder y debe actualizarse con precios oficiales antes de usarla para presupuestos de producción.
- **Persistencia:** Trip Twin y reportes guardan datos en el almacenamiento local de este navegador. No hay sincronización multiusuario. El comportamiento está respaldado por la implementación; no se probó una restauración entre navegadores o dispositivos.
- **Evidencia de reportes:** el formulario no carga imágenes ni envía enlaces; solo registra la opción declarada. No debe tratarse como evidencia verificada.

### Estado de verificación

- Rutas HTTP visitadas: `/`, `/resultados`, `/destino/MDZ`, `/comparar`, `/sorpresa`, `/guardados`, `/live`, `/trip-twin`, las tres rutas `/feedback/MDZ/*` y `/api/health`: **200**.
- `npm run lint`: correcto.
- `npm run typecheck`: correcto.
- `npm test`: **17 archivos, 193 pruebas aprobadas** después de corregir el cálculo de confianza.
- `/api/live-data?city=Santiago, Chile`: respondió con clima, 24 lugares y estado `ok` de geocodificación, clima y Overpass en el momento de la prueba.
- `npm run build`: compiló, pasó TypeScript y generó las 17 páginas estáticas/dinámicas; el empaquetado final `output: standalone` falló al crear directorios bajo `.next/standalone` con `EPERM` en Windows. Se repitió tras solicitar permiso de escritura al proyecto y el mismo error persistió. No se puede marcar como build de producción aprobado en este entorno.
- En la comprobación HTTP local final, `/live?city=...` y `/trip-twin` devolvieron 200. `/api/live-data` también devolvió 200 con Open-Meteo operativo; Overpass informó `unavailable` y cero lugares en esa consulta puntual. Al recargar Pulsos después, el navegador recibió 24 lugares OSM. La disponibilidad/cobertura de Overpass es variable y la UI debe tolerar respuestas vacías.
- Inspección visual: se comprobó una captura de Pulsos en un viewport de 853×656 y Trip Twin en el mismo tamaño. No equivale a una comprobación completa en desktop ancho ni en un móvil físico de 390 px. Trip Twin inicialmente mostraba desbordamiento horizontal en ese viewport; se ajustó el ancho disponible y la captura posterior ya no muestra barra horizontal.
- Se observó un aviso de una incidencia en Next Dev Tools; el registro correspondía al entorno de desarrollo embebido. No se pudo atribuir con certeza a código de producto ni confirmar comportamiento de consola en build de producción.

**Conclusión de producto:** la portada ahora posiciona Travel Pulse como una plataforma city-first con cuatro capas explícitas: World Monitor, Pulso humano, Opportunity Index y Mi viaje/Trip Twin. La búsqueda de destino queda como módulo secundario. `/live` comienza por buscar una ciudad y luego presenta clima/lugares, mapa geográfico de OSM y el pulso local. El mapa esquemático ya no muestra marcadores fijos ni los hace pasar por reportes geolocalizados. Sigue pendiente conectar sensores humanos y ubicaciones reales con consentimiento, sincronizar usuarios y ampliar replanificación con rutas y tarifas.

### Ajuste de jerarquía de producto (28-10-2026)

- La portada ahora parte de “¿Qué ciudad quieres entender?” y muestra los cuatro módulos de la propuesta. Incluye accesos independientes a explorar ciudad, Mi viaje y descubrir destinos; el formulario por presupuesto y preferencias quedó en una sección secundaria desplegable.
- `/live` permite cambiar de ciudad desde la parte superior, antes de consultar sus fuentes, y distingue el pulso ciudadano del contexto meteorológico y de lugares.
- `/live` muestra por separado el estado consultado de geocodificación, clima y lugares por ciudad. Tráfico, seguridad y afluencia oficial siguen sin proveedor conectado.
- Una observación local propia puede abrir Mi viaje como contexto, conservando categoría, texto, lugar, fecha y confirmaciones locales. El usuario puede elegir una actividad y pedir una vista previa de demora o retiro mediante el asistente y el motor de planes existentes; el cambio requiere aprobación. El sistema no determina si la observación aplica a esa actividad ni verifica la señal automáticamente.
- El mapa de reportes es ahora una ilustración conceptual sin puntos ni contador geográfico inventado. El mapa real de OSM sigue separado y corresponde a lugares mapeados.
- El distintivo Opportunity Index en resultados se explica como una señal de precio relativo de vuelo más saturación estacional; es un indicador de destino, no el pulso en tiempo real de una ciudad.
- Esto corrige el orden y el lenguaje de la experiencia, pero no implementa aún la propuesta visual completa: los sensores humanos compartidos, Opportunity Index contextual por fecha/actividad, navegación unificada y cobertura real por ciudad siguen siendo trabajo de producto e integración.
- En escritorio, la portada y Live ya pueden usar el ancho disponible; en móvil mantienen el marco compacto del producto.
- Verificación posterior a este ajuste: `npm.cmd run lint`, `npm.cmd run typecheck` y `npm.cmd test -- --run` pasan (19 archivos, 202 pruebas). `npm.cmd run build` compiló, pasó TypeScript y generó las 17 páginas, pero falló al copiar los archivos trazados a `.next/standalone` por `EPERM` en Windows; no se marca como build exitoso.

## Travel Pulse conectado — estado del MVP (28-10-2026)

La app ya permite explorar una ciudad y usar datos externos para empezar un itinerario:

- **Clima:** consulta pronóstico y condiciones actuales mediante Open-Meteo. Es una salida de modelo, no una alerta oficial ni una garantía de condiciones en terreno.
- **Lugares:** consulta objetos mapeados de OpenStreetMap mediante Overpass. Los datos no certifican apertura, horarios, seguridad, accesibilidad ni calidad. En `/live`, el mapa real de OSM muestra puntos numerados aproximados; pulsar uno lo añade al itinerario. Las fichas también tienen la acción `+ Mi viaje`.
- **Mi viaje / Trip Twin:** los lugares elegidos y el contexto meteorológico de la ciudad se conservan en `localStorage` de este navegador. Si el pronóstico de mañana marca lluvia probable y hay categorías compatibles, Trip Twin ofrece una alternativa OSM para que el viajero decida si la aplica. No se sincroniza entre dispositivos.
- **Señales de viajeros:** reportes y confirmaciones siguen siendo locales y los ejemplos se distinguen de los reportes del usuario. No hay una comunidad conectada ni validación global.
- **IA:** el chat de Trip Twin interpreta acciones acotadas; con `ANTHROPIC_API_KEY` usa Haiku para clasificar la petición, y sin clave usa reglas locales. El motor de reglas recalcula la vista previa. No se conecta a IA para detectar seguridad ni para inventar rutas/precios. **Tráfico y tarifas** no están conectados; los horarios, precios, traslados y seguridad no deben interpretarse como datos actuales.

### Integraciones elegidas

| Servicio | Uso ahora / siguiente paso | Requisito o límite |
|---|---|---|
| Open-Meteo | Pronóstico consultado desde `/api/live-data`; base para una sugerencia meteorológica explicable. | La API gratuita está destinada a uso no comercial hasta 10.000 llamadas diarias; un producto comercial necesita el plan/licencia correspondiente y atribución. Ver [planes](https://open-meteo.com/en/pricing) y [términos](https://open-meteo.com/en/terms). |
| OpenStreetMap + Overpass | Lugares consultados y mapas embebidos; selección de POIs inicia el plan. | La instancia pública de teselas es un servicio comunitario de mejor esfuerzo, sin SLA. Atribuir, respetar caché y evitar precarga; para producción comercial/volumen conviene un proveedor de mapas contratado o alojar teselas. [Política de teselas](https://operations.osmfoundation.org/policies/tiles/). |
| GitHub Actions | Workflow de CI preparado para instalar, ejecutar lint, tipos, pruebas y build al hacer push/PR. | Necesita que el usuario inicialice o conecte el repositorio a GitHub; esta carpeta local no quedó publicada ni conectada a una cuenta. |
| Supabase | Es la opción prevista para cuentas, persistencia sincronizada de viajes/reportes y realtime; el repo ya contiene migraciones/RLS. | No hay proyecto conectado ni credenciales. Antes de activar, revisar las migraciones y políticas RLS en un proyecto propio y usar claves exclusivamente desde el servidor. La integración Next.js SSR oficial usa `@supabase/ssr`. [Guía oficial](https://supabase.com/docs/guides/auth/quickstarts/nextjs). |
| Vercel | Despliegue y previews de Next.js desde el proveedor Git conectado. | No hay proyecto ni cuenta de Vercel conectado y no se publicó el sitio. Vercel puede generar previews por ramas/PR y despliegues de producción desde la rama configurada. [Git deployments](https://vercel.com/docs/git). |
| Google Routes / Amadeus | Candidatos para tráfico/rutas y búsqueda de tarifas en una etapa posterior. | Requieren cuentas, claves y revisar cobertura, facturación y términos. Google `TRAFFIC_AWARE` tiene nivel de facturación Pro; Amadeus recomienda volver a cotizar disponibilidad/precio antes de reservar. [Google Routes](https://developers.google.com/maps/documentation/routes/usage-and-billing), [Amadeus](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/). |

**Decisión:** sí conviene integrar servicios, cada uno para una función concreta; no conectar todo a la vez. Open-Meteo y OSM aportan datos del destino, Supabase resuelve identidad/sincronización, GitHub automatiza calidad del código y Vercel publica el producto. GitHub, Supabase y Vercel quedan preparados o documentados, pero requieren proyecto/cuenta del usuario para completar la conexión. No se creó infraestructura externa, no se subió código ni se desplegó.

### Comprobaciones del incremento conectado

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm test`: 19 archivos, 202 pruebas aprobadas.
- `POST /api/trip-twin/assistant`: prueba de extremo HTTP respondió 200 para “Retrasa Visita cultural 30 minutos”, devolvió la propuesta limitada a `museum`, cero conflictos y tres advertencias por datos ya incompletos; indicó interpretación local por no tener clave Anthropic y no alteró el plan.
- `/api/live-data` consultó clima y lugares en la sesión de desarrollo previa; disponibilidad y cobertura dependen de terceros y de la ciudad.
- `npm run build`: compilación, tipos y generación de páginas pasan; el paso de empaquetado `standalone` falla al crear directorios de `.next/standalone` con `EPERM` en Windows, incluso tras repetirlo con permiso de escritura. No se verificó un paquete de producción terminado.
- Verificación HTTP: `/live` y `/trip-twin` devolvieron 200; `/api/live-data` devolvió 200 y Open-Meteo `ok`. Overpass varió entre `unavailable`/0 lugares y 24 lugares al recargar; no se garantiza cobertura.
