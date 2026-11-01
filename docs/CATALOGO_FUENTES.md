# Catálogo de fuentes de datos (Prompt Maestro §14)

Versión 0.5.0 · 31-oct-2026. **Regla de producto: solo datos reales. Si no hay fuente real, el dato es «sin dato» y no se puntúa.** No se estima, no se interpola, no se generan números.

## Datos reales hoy
| Dato | Fuente | Estado | Cómo llega | Verificación |
|---|---|---|---|---|
| Riesgo oficial por país | FCDO (GOV.UK), Open Government Licence v3 | **Vivo** | Consulta cada 6 h en el servidor (overlay) | **Contrastado con GOV.UK directamente: 14 de 14 países coinciden.** Los valores `…_to_parts` y `…_whole_country` ahora están observados (Cuba = todo el país → nivel 3) |
| Sismos M4,5+ | USGS | **Vivo** | Cada 10 min | 733 eventos recibidos en la prueba real; informativo, no entra al puntaje |
| Ciclones, inundaciones, volcanes e incendios (naranja y rojo) | GDACS (ONU y Comisión Europea) | **Vivo** | Cada 15 min; 4 tipos pedidos por separado con paginación. GDACS responde **204 sin cuerpo** cuando no hay eventos (manejado) | 92 eventos recibidos; el «0 destinos con eventos cercanos» se verificó con un cálculo independiente de distancias. Términos de uso por revisar antes de producción |
| Clima mensual (temp., lluvia, viento) de los 30 destinos | Open-Meteo Historical API (ERA5), CC BY 4.0 | **Real, histórico** (climatología 2015-2024) | `scripts/fetch-real-data.mjs` → `real.generated.json` | 30 de 30 destinos; pruebas de coherencia física (estaciones, hemisferios, altitud) |
| Tendencia de interés (30 d vs 30 d previos) | Wikimedia Pageviews (es.wikipedia.org), CC0 | **Real, instantánea** con fecha | Mismo script | 29 de 30; Cusco pendiente (la API limitó el ritmo). Es un indicador de interés, no de reservas |
| Clima y lugares de una ciudad (`/ciudad`) | Open-Meteo y OpenStreetMap (ODbL) | Vivo, bajo demanda | Navegador | Open-Meteo accesible; OSM sin cambios |

## Sin fuente conectada (valor `null`, el motor lo declara «sin dato»)
| Dato | Por qué falta | Qué haría falta |
|---|---|---|
| Precio de vuelos | No existe fuente abierta fiable. **Amadeus Self-Service cerró el 17-jul-2026** (verificado), así que ya no es opción | Candidatas a evaluar: Travelpayouts/Aviasales Data API (gratis con cuenta de afiliado; precios en caché de búsquedas de usuarios, cobertura SCL sin verificar) y Duffel (pago por búsqueda; cobertura LATAM sin verificar). **Lo elige y contrata el dueño** |
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

## «Mi día en la ciudad» (0.7.0): fuentes y hallazgos verificados con datos reales (1-nov-2026)

| Dato | Fuente | Estado y límites |
|---|---|---|
| Lugares (museos, galerías y centros culturales, restaurantes, pubs, parques) | OpenStreetMap vía **Nominatim** (ODbL) | ✅ Consulta con pausa de 1 s y caché de 6 h. **Overpass no responde desde el entorno de desarrollo**; no se usa. |
| Horario de apertura | Etiqueta `opening_hours` de OSM | ⚠️ Museos ~50 %, restaurantes y pubs ~15 %. Se interpreta con un intérprete propio (21 pruebas con horarios reales). **Lo no interpretable se muestra como «horario sin confirmar»; nunca se supone abierto.** |
| Traslados | **OSRM de FOSSGIS** (`routing.openstreetmap.de`) | ✅ A pie y en auto por separado. **El servidor de demostración de project-osrm.org ignora el modo y devuelve tiempos en auto** (9,6 min para 2,6 km «a pie»): no se usa. Los tiempos en auto no incluyen tráfico. |
| Pronóstico por hora | Open-Meteo | ✅ Hasta ~15 días. Fuera de alcance: se dice y no se evalúa la lluvia. |
| Foto y descripción | Wikipedia (artículo enlazado por la etiqueta `wikipedia` de OSM) | ✅ Solo para lugares notables (museos 25/40, centros 5/9; restaurantes y pubs: ninguno). Las miniaturas vienen de **`thumb.wikimedia.org`**. Se muestra siempre la atribución. |
| Fila, precio pagado, «está bueno», «cerró» | Viajeros (PulseMesh) | Base lista; vacío hasta que haya reportes. |
| Precio de entradas y comidas | — | ❌ Sin fuente real. |

### Lo que descubrió probar con datos reales (y se corrigió)
- Las galerías de São Paulo casi no están como `tourism=gallery`: son `amenity=arts_centre` (Tomie Ohtake, CCBB, SESC Paulista…); las galerías de arte salen buscando en portugués («galeria de arte»).
- Un horario como `Tu-Fr 18:00-03:30` mostraba «cierra 00:00»: se recortaba a medianoche.
- Un «almuerzo» se programaba a las 18:00 porque el primer restaurante abría a esa hora: ahora una espera de más de 60 min descarta el lugar salvo que no haya otra opción, y se avisa.
- Los resultados de Nominatim para la misma consulta pueden variar entre llamadas: el plan puede cambiar al reiniciar el servidor (la caché dura 6 h por proceso).
