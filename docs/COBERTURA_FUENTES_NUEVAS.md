# Sondeo de cobertura de fuentes nuevas (2026-11-16)

Medido desde el sandbox con `node scripts/probe-fuentes.mjs` (solo lectura, sin claves). Nada de esto está integrado aún.
Las afirmaciones de cobertura que vienen de textos externos NO se dan por buenas hasta aparecer aquí.

| Fuente | Estado medido | Qué trae para las 4 ciudades | Decisión |
|---|---|---|---|
| **Wikivoyage** (es/en) | Responde, sin clave | Guía completa en las 4 (en: SP 88 k, Santiago 38 k, Valparaíso 22 k, Antofagasta 8 k caracteres; es: 107 k / 30 k / 49 k / 13 k) con secciones Ver, Hacer, Comer, Cómo desplazarse, Seguridad | **Integrar primero** (licencia CC BY-SA: atribución obligatoria) |
| **Wikidata** (patrimonio UNESCO/protegido ≤40 km) | Responde, sin clave | SP 3563, Santiago 260, Valparaíso 108, Antofagasta 20 bienes con estatuto de protección | Integrar (contexto cultural verificable) |
| **GBIF** (aves ≤30 km) | Responde, sin clave | SP 1,4 M, Santiago 930 k, Valparaíso 550 k, Antofagasta 44 k observaciones | Integrar para "naturaleza" (cuidar el sesgo: más datos = más observadores, no más aves) |
| **Overture Maps** | S3 público alcanzable; releases 2026-09-23 y 2026-10-21 | Formato Parquet: falta medir solapamiento con OSM | Evaluar después, requiere herramienta (DuckDB) |
| **Waymarked Trails** | API responde, pero `by_area` devolvió 0 rutas en Santiago | Búsqueda por texto sí devuelve rutas | Pendiente: aclarar el endpoint antes de decidir |
| **OSM wheelchair=*** (Overpass) | Overpass caído (503/abort) desde el sandbox | Sin medir | Reintentar desde otra red; no se puede concluir |
| **OpenAQ v3** | 401: exige clave | Sin medir | Pide clave gratuita |
| **Ticketmaster** | 401: exige clave | Sin medir (la cobertura Chile/Brasil NO está verificada) | Pide clave gratuita |
| **OpenTripMap** | 401: exige clave | Sin medir | Pide clave gratuita |
| **NASA FIRMS** | Exige MAP_KEY | Sin medir | Pide clave gratuita |
| **GeoNames** | Cuenta demo agotada | Sin medir | Pide usuario gratuito |
| **Mobility Database** | Error de cabeceras sin token | Sin medir | Pide token gratuito |
| **DTPM (Santiago)** | `sacbe.dtpm.cl` no resuelve; página GTFS responde | Tiempo real no verificado; GTFS estático sí es descargable | Probar GTFS estático; tiempo real exige acceso |
| **Urbis (São Paulo)** | Host no resuelve desde el sandbox | Sin medir | Reintentar desde otra red / verificar la URL real |
| **Amadeus Activities** | Host no resuelve; exige registro | Sin medir | Condiciones de acceso sin verificar |

## Lo que significa
- Sin claves, hoy se pueden integrar con datos reales: **Wikivoyage, Wikidata y GBIF**. Cubren "conocimiento práctico/cultural del destino" y "naturaleza".
- Eventos (Ticketmaster/OpenAgenda), calidad del aire, incendios, transporte en tiempo real y actividades reservables **necesitan claves o accesos que no están en el sandbox**: sin ellos, no hay datos reales y no se inventan.
- Precios y afluencia siguen sin fuente.

## Segunda ronda: fuentes SIN clave que responden (2026-11-16)
| Fuente | Medido | Para qué |
|---|---|---|
| Open-Meteo Air Quality | Santiago PM2.5 14,2 / AQI EE.UU. 59 / UV 5,4; Antofagasta AQI 52 | Calidad del aire y UV en vivo (sustituye a OpenAQ, que pide clave) |
| Open-Meteo Marine | Valparaíso oleaje 1,62 m, mar 18,8 °C | Actividades costeras |
| Nager.Date | Chile 17 y Brasil 15 feriados de 2026 | Cierres y afluencia por feriado |
| Frankfurter (BCE) | USD→BRL 5,71; **CLP no está en su lista** | Cambio solo para monedas que el BCE publica |
| NASA EONET | 200 eventos abiertos (tormentas, incendios…) | Alertas naturales globales; falta filtrar por cercanía |
| Wikipedia geosearch | 50 artículos ≤2 km en Santiago | Contexto de cada zona |
| Wikimedia Commons | 50 fotos geolocalizadas ≤1,5 km en Valparaíso | Fotos con licencia abierta (exigen atribución) |
| Nominatim extratags | Museo de Bellas Artes: fee=no, toilets=yes | Entrada gratis/baños, lo que OSM sepa |
| datos.gob.cl (CKAN) | 138 conjuntos "turismo" | Datos oficiales de Chile por revisar |
| GTFS estático DTPM | ZIP descargable (agency.txt…) | Transporte programado de Santiago, NO tiempo real |
| CSN Chile vía api.xor.cl | Responde (envoltorio de terceros) | Sismos locales; verificar fiabilidad del intermediario |
| Wikidata museos | 425 "museos con web" ≤15 km Santiago | Cifra sospechosa (la consulta incluye subclases): NO fiable sin validar |

Sin respuesta: espejos de Overpass (kumi, mail.ru, private.coffee) caídos; dados.gov.br exige acceso (401).
