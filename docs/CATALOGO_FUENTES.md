# Catálogo de fuentes de datos (Prompt Maestro §14)

Versión 0.5.0 · 31-oct-2026. **Regla de producto: solo datos reales. Si no hay fuente real, el dato es «sin dato» y no se puntúa.** No se estima, no se interpola, no se generan números.

## Datos reales hoy
| Dato | Fuente | Estado | Cómo llega | Verificación |
|---|---|---|---|---|
| Riesgo oficial por país | FCDO (GOV.UK), Open Government Licence v3 | **Vivo** | Consulta cada 6 h en el servidor (overlay) | **Contrastado con GOV.UK directamente: 14 de 14 países coinciden.** Los valores `…_to_parts` y `…_whole_country` ahora están observados (Cuba = todo el país → nivel 3) |
| Sismos M4,5+ | USGS | **Vivo** | Cada 10 min | 733 eventos recibidos en la prueba real; informativo, no entra al puntaje |
| Clima mensual (temp., lluvia, viento) de los 30 destinos | Open-Meteo Historical API (ERA5), CC BY 4.0 | **Real, histórico** (climatología 2015-2024) | `scripts/fetch-real-data.mjs` → `real.generated.json` | 30 de 30 destinos; pruebas de coherencia física (estaciones, hemisferios, altitud) |
| Tendencia de interés (30 d vs 30 d previos) | Wikimedia Pageviews (es.wikipedia.org), CC0 | **Real, instantánea** con fecha | Mismo script | 29 de 30; Cusco pendiente (la API limitó el ritmo). Es un indicador de interés, no de reservas |
| Clima y lugares de una ciudad (`/ciudad`) | Open-Meteo y OpenStreetMap (ODbL) | Vivo, bajo demanda | Navegador | Open-Meteo accesible; OSM sin cambios |

## Sin fuente conectada (valor `null`, el motor lo declara «sin dato»)
| Dato | Por qué falta | Qué haría falta |
|---|---|---|
| Precio de vuelos | No existe fuente abierta fiable | Una API con clave (p. ej. Amadeus o Duffel) y su plan; **lo elige y contrata el dueño** |
| Costo diario del destino | Sin fuente abierta fiable | Proveedor de costo de vida con licencia |
| Conectividad (vuelo directo, horas, frecuencia) | OpenFlights es de 2014 (obsoleto) y sin frecuencias | Proveedor de rutas actual |
| Saturación turística y temporada | No hay fuente abierta; no se derivan para no duplicar el clima | Fuente de afluencia o señales de PulseMesh |
| Tendencia de precio | Depende de la fuente de precios | Ídem |

## Lo editorial (no es observación del mundo)
Nombre, coordenadas, altitud, afinidad por interés (0-5), descripción y paleta de cada destino son clasificación propia del producto. Es el factor «Experiencia».

## Qué se eliminó de las versiones anteriores
El dataset fabricaba precios con una función pseudoaleatoria, costos y saturación con fórmulas, y atribuía un clima escrito a mano a «open-meteo». Ya no existe nada de eso y los tests lo impiden (`validate.test.ts`: ninguna fuente de datos inventados puede aparecer).

## Consecuencias que se muestran tal cual
Con 4 de 8 factores reales la confianza ronda 35-37 %, bajo el umbral de 40 %. Cada destino sale como «Información limitada», con lo que falta, sin puntaje. El simulador What-If y el costo total no se ofrecen hasta conectar precios.

## Variables de entorno
`LIVE_SOURCES=0` desactiva las fuentes vivas · `TP_FCDO_BASE` / `TP_USGS_BASE` apuntan a otro servidor (pruebas, `qa/mock-sources.js`). Para refrescar clima e interés: `NODE_USE_ENV_PROXY=1 node scripts/fetch-real-data.mjs` (reanudable).
