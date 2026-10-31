# Auditoría de Travel Pulse (28 de octubre de 2026)

Repositorio: rodrigozunigacal-lgtm/travel-pulse (commit fa2a030). Entorno de prueba: Linux, Node 22, Chromium (Playwright). Sin acceso a Open-Meteo ni a OpenStreetMap desde ese entorno.

## Verificado con ejecución real
- `npm ci` FALLABA (ERESOLVE): vitest 5 exige @types/node ^22 y el proyecto tenía ^20. Corregido en package.json (@types/node ^22, eslint-config-next ^16.4.3) y package-lock.json regenerado. Ahora `npm ci` funciona.
- `npm audit --omit=dev`: 0 vulnerabilidades (Next 16.4.3, zod 4.6.7).
- `npm run typecheck`: sin errores.
- `npm test`: 19 archivos, 205 pruebas, todas pasan.
- `npm run build`: compila; 17 páginas y 14 endpoints.
- `npm run lint` FALLABA: eslint.config.mjs usaba FlatCompat, incompatible con eslint-config-next 16. Migrado al formato plano. Quedan 12 AVISOS (no errores) de reglas nuevas de React 19 (set-state-in-effect, purity, refs); pendientes de refactorizar.
- Navegador (Chromium, móvil 390x844): inicio, /live, /trip-twin, /guardados y /sorpresa cargan. Clics comprobados: "Ver pulso de la ciudad" navega a /live?city=...; en /trip-twin responden Reiniciar, subir/bajar actividad y seleccionar actividad.

## Hallazgos pendientes
- /trip-twin lanza el error de React #418 (diferencia de texto en hidratación) en la versión de producción. No bloquea los clics probados, pero conviene encontrar el origen.
- La política CSP bloqueaba las imágenes de images.unsplash.com (img-src solo 'self'). Se añadió ese dominio. Depender de imágenes externas es un riesgo de privacidad y disponibilidad.
- Con Open-Meteo/Overpass inaccesibles, /live muestra su estado de error controlado (comportamiento correcto). La integración en vivo NO pudo probarse aquí.
- El mensaje de error une dos frases sin punto ("fetch failed Los reportes...").

## Cambios visuales
Paleta azul noche con cian: tokens en src/app/globals.css (amarillo #ffd400 sustituido por cian #46d4f2 y fondos oscuros), tema oscuro por defecto (layout.tsx), y colores fijos en componentes, ícono PWA y tarjeta de compartir.

## Incremento: Importar mi viaje (Módulo B del prompt maestro)
Implementado y probado:
- `src/lib/trip-twin/import.ts`: intérprete determinista (sin IA) de texto libre. Extrae días, horas, rangos horarios, duraciones y costos. Cada dato queda como "dado por ti", "inferido" o "desconocido". Alojamiento, presupuesto y notas quedan como "pendiente de verificar", no como actividades. No inventa horarios, precios ni traslados.
- `src/app/importar/page.tsx`: pegar, interpretar, revisar y editar, quitar actividades, guardar y eliminar. Guarda en el navegador (clave `travel-pulse.trip-twin.v1`), que Trip Twin ya restauraba.
- `src/app/trip-twin/page.tsx`: ahora muestra destino, fechas, zona horaria y textos del viaje importado en lugar de la demostración de São Paulo.
- 13 pruebas nuevas (218 en total, todas pasan). Navegador (Chromium): importar, revisar, quitar, guardar, abrir en Trip Twin, persistir tras recargar y eliminar; todo verificado. En esa prueba la respuesta de /api/live-data se simuló, porque el entorno no llega a Open-Meteo.

Limitaciones: el intérprete cubre formatos comunes ("Día 1", "09:00 Actividad"); no usa un LLM. Las ubicaciones de las actividades son el centro de la ciudad (aproximadas), así que los traslados quedan sin calcular. No hay cuentas ni base de datos: el itinerario vive solo en el dispositivo.

## Estado frente al prompt maestro
Hecho: Fase 0 (auditoría), Fase 1 (estabilización), parte de la Fase 3 (importar y Trip Twin, solo local).
Pendiente: persistencia y autenticación con aislamiento por usuario (Fase 2), conectores de fuentes con procedencia completa (Fase 4), Pulsos compartidos con moderación (Fase 5), copiloto proactivo (Fase 6), pruebas de privacidad (Fase 7). Error React #418 en /trip-twin sin resolver (no bloquea los clics probados).

## Incremento: Pulso conectado con el viaje del usuario
- `src/lib/signals/trip-link.ts` (+3 pruebas): elige la señal comunitaria vigente más reciente de la ciudad del viaje; ignora ejemplos, señales caducadas y de otras ciudades.
- Trip Twin: en un viaje importado, si existe una señal vigente de su ciudad, muestra el aviso "Observación recibida desde Pulso" con las acciones ya existentes ("Preparar demora +30 min", "Preparar retiro"). No modifica el plan sin aprobación del viajero.
- Pulso: las tarjetas de señal siguen el diseño de referencia (icono por tipo, título, lugar y antigüedad, etiqueta de categoría, Pulse Line de vigencia).
- Verificado en Chromium: importar viaje a Santiago, crear una señal en el formulario de Pulso y ver el aviso en Mi viaje. Limitación: la señal vive solo en el navegador (sin sincronización entre usuarios).

## Matriz frente al "Plan maestro de producto" (verificado en código y navegador)
| Módulo del plan | Estado | Evidencia |
|---|---|---|
| 1 Inicio y descubrimiento | Parcial | `/` (búsqueda de ciudad), `/resultados`, `/sorpresa`; recomendaciones con puntaje explicable |
| 2 Detalle del destino | Parcial | `/destino/[id]`, `/api/destinations/[id]`; clima y lugares reales solo en `/live` |
| 3 Comparador | Existe, sin verificar a fondo | `/comparar`, `/api/compare` |
| 4 Trip Twin | Funciona con datos sintéticos; importar viaje real añadido | `/trip-twin`, `/importar`, 218+3 pruebas |
| 5 Guardados y viajes | Solo local | `/guardados`, localStorage; sin cuenta ni servidor |
| 6 Señales comunitarias | Local, conectado a Trip Twin | `/live`, `/api/signals` solo valida |
| Pulse Index | No existe | sin código |
| Opportunity Index | Parcial: puntaje explicable de destinos | `src/lib/engine`, `ResultsView` |

## Incremento: City Pulse real (`/ciudad`)
- `src/components/screens/CityPulseView.tsx` y `src/app/ciudad/page.tsx`: pantalla con buscador y pestañas Resumen, Mapa, Clima, Lugares y Señales, según la visión 10/10.
  - Resumen: clima actual (Open-Meteo, con antigüedad y etiqueta "Real"), panel "¿Qué cambió hoy?" construido solo con datos reales (probabilidad de lluvia ≥ 50 % y señales vigentes), conteos y accesos a Trip Twin y a reportar.
  - Mapa: mapa interactivo de OpenStreetMap (iframe); el marcador es el centro de la ciudad.
  - Clima: previsión de 7 días. Lugares: lista de OpenStreetMap con "Horario sin verificar". Señales: tarjetas con vigencia, confianza orientativa y ejemplos marcados.
  - Estados: carga, error con reintento, error de proveedor, sin conexión y última información guardada, baja cobertura.
- El inicio ahora lleva a `/ciudad` (antes `/live`). `/live` se mantiene como feed de Pulso y formulario de reporte.
- Probado en Chromium con la respuesta de /api/live-data simulada: navegación desde el inicio, las 5 pestañas y el contenido de cada una.
- Pendiente: la fuente serif de la visión (Instrument Serif) necesita alojarse localmente porque la política de seguridad bloquea Google Fonts; hoy usa Georgia como respaldo. El mapa no pinta cada lugar como marcador.

## Incremento visual: globo 3D y profundidad
- `src/components/lux/GlobeHero.tsx`: globo de alambre con meridianos que giran (ilusión 3D con SVG y CSS), arco de pulso y marcador con ondas. Es decorativo: no representa datos. Respeta "reducir movimiento" (sin animación, con meridianos fijos).
- Integrado en el inicio y en la cabecera de City Pulse (con marcador al centro). Esqueletos de carga en City Pulse; tarjetas con relieve y elevación al pasar el cursor.
- No hay una librería 3D real (three.js u otra): el efecto es visual, no un mapa tridimensional.
