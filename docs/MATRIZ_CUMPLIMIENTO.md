# Matriz de cumplimiento — Prompt Maestro 2.0

Fecha: 31 de octubre de 2026 · Versión: 0.5.1 · Base: repositorio público (fa2a030) + parche de auditoría del 28-oct + incremento de esta sesión.

Estados (del prompt, sección 32): **Implementado y verificado** · Implementado sin validar · **Parcial** · **Pendiente** · Bloqueado · No viable en el entorno actual.

"Verificado" significa que lo ejecuté y observé el resultado (pruebas, API real o navegador), no que lo leí en el código.

## 1. Los 20 módulos frente al código

| # | Módulo | Estado | Qué existe (evidencia) | Qué falta | Fase |
|---|---|---|---|---|---|
| 1 | Discover | Parcial | `/`, `/resultados`, `/sorpresa`; ranking real con la semilla (API probada) | Filtros, Hidden Gems, "Send Me Somewhere" ya existe pero sin señales de tendencia | 1 |
| 2 | Destination Intelligence | Parcial | `/destino/[id]` con desglose por factor, fuente y fecha; `/ciudad` con clima y lugares reales | Clima y lugares reales solo en `/ciudad`, no en la ficha; sin transporte ni barrios | 1 |
| 3 | Pulse Index | Parcial | `evaluateDestination`: 8 factores, pesos por intereses, reponderación, confianza, "no publica puntaje bajo 40 %" (221 pruebas previas) | Se llama "score"/"Opportunity Score" en la UI, no "Pulse Index". Decisión: mantener un solo número | 2 |
| 4 | Opportunity Index | Parcial | Bandera `opportunity` (vuelo ≥10 % bajo lo habitual y saturación mejor que el mes previo) | Es una bandera, no un índice; depende de precios que hoy son semilla | 2 |
| 5 | Comparator | Parcial | `compareDestinations` con 8 factores y veredicto por prioridad; `/api/compare` probado; `/comparar` responde 200 | No probé la interfaz en navegador; máximo 2 destinos (el diseño pide 2–4) | 2 |
| 6 | Trip Twin | Parcial | `/trip-twin` (demo y viaje importado), `/importar`, reordenar y ajustar duración, replanificación propuesta con aprobación del viajero (según el código; auditoría previa probó reordenar y reiniciar en navegador) | **Deshacer, rehacer e historial (0.3.1): implementado y verificado** (6 pruebas unitarias y E2E 15/15 en móvil y escritorio; se guarda en el dispositivo, hasta 20 cambios; reiniciar también se puede deshacer). Pendiente: versiones con nombre y vista comparada. Actividades sintéticas o aproximadas; sin cuentas | 3 |
| 7 | AI Router | Pendiente | — (los traslados figuran "sin datos") | Proveedor de rutas y optimizador | 3 |
| 8 | Travel Memory / DNA | **Implementado y verificado** (solo local) | `/perfil`, `dna-core.ts` (14 pruebas), E2E: guardar, recargar, exportar/importar, borrar | Sincronización entre dispositivos requiere cuentas (módulo de autenticación pendiente) | 1 |
| 9 | PulseMesh | Parcial | `/live` y `/api/signals`: señales con vigencia y confianza, solo en el navegador | Sin servidor, moderación ni corroboración entre usuarios | 5 |
| 10 | Reality Check | Parcial | `realityCheck` compara el destino con una alternativa similar; Expectation Gap antes/durante/después | No contrasta información publicada con reportes recientes | 4 |
| 11 | Safety Intelligence | Parcial | Factor "riesgo" con nivel 1–4 (excluye el 4) alimentado por el aviso del FCDO en vivo (14 países), con fuente, fecha de consulta y degradación declarada; sismos USGS por destino en `/radar` | **Fuentes reales no probadas desde este entorno** (sin salida a internet): verificado con servidor falso de la misma forma; un solo gobierno como fuente; sin alertas locales ni clima extremo | 4 |
| 12 | Travel Radar | Parcial | **0.3.2: medidor del nivel más alto observado y lista de alertas activas (verificado en móvil, tablet y escritorio).** `/radar` + `/api/radar`: mapa mundial, riesgo oficial y sismos por destino, estado y hora de cada fuente (11 pruebas E2E con fuentes simuladas, móvil y escritorio) | Detección de **cambios** en el tiempo (series): no existe; sin tendencias | 6 |
| 13 | What-If Simulator | **Implementado y verificado** (nivel destino) | `whatif.ts` (13 pruebas), `/api/what-if` (9 caminos probados), panel en la ficha, E2E móvil y escritorio | What-If a nivel itinerario (quitar una actividad, "si llueve") no existe | 3 |
| 14 | Hidden / Rising Gems | Pendiente | Sorpresa elige al azar entre candidatos; no mide interés creciente | Señales de tendencia reales | 6 |
| 15 | Traveler Radar | Pendiente | — | Comunidad y privacidad | 7 |
| 16 | Travelers Like You | Pendiente | — | Comunidad | 7 |
| 17 | Living Routes | Pendiente | — | Rutas compartibles | 7 |
| 18 | World Citizen Passport | Pendiente | — | Fuera del MVP por mandato | 7 |
| 19 | Travel Economy | Parcial | Enlaces de afiliado con clic registrado y aviso comercial | Sin reservas ni catálogo | 7 |
| 20 | Travel Intelligence as a Service | Pendiente | — | Largo plazo | 7 |

## 2. MVP definido por tu documento de estrategia

MVP = Discover, Destination Intelligence, Compare, My Travel DNA, Trip Twin básico.

| Pieza | Estado |
|---|---|
| Discover | Parcial |
| Destination Intelligence | Parcial |
| Compare | Parcial (UI sin verificar) |
| My Travel DNA | Implementado y verificado (local) |
| Trip Twin básico | Parcial |
| What-If básico | Implementado y verificado (destino) |

## 3. Gates de lanzamiento

| Gate | Estado | Evidencia o motivo |
|---|---|---|
| A. Base técnica | **Aprobado** | `npm ci`, `tsc`, 283 pruebas, build y `npm audit --omit=dev` (0) en limpio. Lint: 0 errores, 16 avisos |
| B. Experiencia | **Parcial** | Pantallas nuevas verificadas en móvil 390 px sin desbordes. Recibí 12 imágenes de referencia; el Radar adopta su lenguaje (mapa oscuro, nivel de riesgo, tarjetas por destino) pero **no es una réplica**: no hay medidor TRSS, ni tarjetas con fotos, ni chat de IA. Sin comparación píxel a píxel, tablet ni axe. Parcial |
| C. Datos y confianza | **Pendiente** | Riesgo oficial ahora vivo (FCDO) y sismos (USGS), pero **sin verificar contra los servicios reales** desde este entorno. Precios, conectividad y tendencia siguen vencidos (confianza 54 % → 56 % con riesgo vivo). Clima y lugares no probados |
| D. Producción | **Pendiente** | Sin autenticación (sin Supabase por decisión del dueño), sin persistencia en servidor, sin monitoreo ni plan de rollback documentado |

No declaro el producto terminado: los gates C y D están abiertos y B está parcial.

## 4. Regla de integración (de tu documento)

Los módulos no son pantallas aisladas. Flujo actual verificado de punta a punta:
**Travel DNA → precarga la búsqueda → ranking (riesgo oficial vivo) → ficha del destino → What-If → comparación con tu plan.** Paralelo: **Inicio → Radar en vivo → ficha del destino.**
Falta cerrar el ciclo hacia Trip Twin: del destino elegido al itinerario editable.

## 5. Cuentas y nube (0.4.0)

| Pieza | Estado |
|---|---|
| Esquema y RLS (`0004`) | **Implementado y verificado** contra Postgres 16 real: 24 comprobaciones con dos usuarios |
| Sincronización DNA, guardados y viaje activo | **Implementado y verificado** con fakes (13 pruebas) y en navegador con Supabase simulado (19 de 19) |
| Contra un proyecto Supabase real y correo real | **Implementado sin validar** en producción: requiere que apliques `docs/CONFIGURAR_NUBE.md` |
| PulseMesh en servidor | Pendiente (sigue en el navegador) |

## 6. Datos reales (0.5.0)

Regla del dueño: solo datos reales. Detalle en `docs/CATALOGO_FUENTES.md`.

| Pieza | Estado |
|---|---|
| Riesgo FCDO y sismos USGS contra los servicios reales | **Implementado y verificado:** 14 de 14 países coinciden con GOV.UK; 733 sismos recibidos |
| Clima real de 30 destinos (Open-Meteo, 2015-2024) | **Implementado y verificado** (coherencia física probada) |
| Tendencia de interés real (Wikipedia) | **Parcial:** 29 de 30 (falta Cusco por límite de la API) |
| Precios, costo diario, conectividad, saturación, temporada | **Bloqueado:** requieren proveedor con clave; hoy «sin dato» |
| Dataset sin datos fabricados | **Implementado y verificado** (tests impiden fuentes inventadas) |
| Trip Twin de demostración y `client/mock.ts` (modo demo) | **Pendiente de eliminar:** siguen siendo datos sintéticos |
| What-If y costo total en la ficha | **No viable** hasta conectar precios reales |
| Puntaje publicado | Ningún destino alcanza el 40 % de confianza hoy |

## 7. PulseMesh (0.5.1)

| Pieza | Estado |
|---|---|
| Reportes de comunidad inventados | **Eliminados** (Pulso y vista de ciudad ya no mezclan datos de ejemplo) |
| Base de datos de reportes, confirmaciones independientes, caducidad y marcas | **Implementado y verificado** en Postgres real: 66 comprobaciones y prueba de mutación (3 de 3 detectadas) |
| Reportar y confirmar desde la app (API y pantallas) | **Pendiente** |
| Agrupar observaciones, contrastar con fuentes oficiales y estructurar con IA | **Pendiente** (la IA nunca se ha probado con clave real) |
| Defensa contra cuentas múltiples y moderación | **Pendiente** |
| Seguridad como categoría | **Fuera del piloto** hasta tener moderación |
| Piloto | Santiago, São Paulo, Valparaíso |
