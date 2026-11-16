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

## Integrado (2026-11-16): «Contexto del día» en Mi día
`src/lib/context/` (feriados Nager.Date + aire y UV Open-Meteo) → `GET /api/contexto?city=&date=` → tarjeta en Mi día.
Cada dato muestra su fuente y si es dato publicado o pronóstico de modelo; si una fuente falla o la fecha está fuera de alcance
(aire/UV: hasta 4 días) se informa en pantalla. Pendiente: Wikivoyage, Wikidata, GBIF, Commons, EONET, GTFS DTPM y las que piden clave.
Ojo con términos: el plan gratuito de Open-Meteo es solo para uso no comercial; revisar antes de monetizar.

## Integrado (2026-11-16): «Guía del destino» (Wikivoyage)
`src/lib/context/guide.ts` → `GET /api/guia?city=` → tarjeta en Mi día. Cita secciones (cómo moverse, seguridad, comer, respetar) con enlace y licencia CC BY-SA 4.0;
dice que es texto de voluntarios no verificado por Travel Pulse. Caché de 24 h; si Wikivoyage limita (429) sirve la copia vieja marcada, o dice que falló.
Hallazgos con datos reales: en la guía en español de Santiago «Seguridad», «Salud» y «Respetar» están **vacías**; se completa solo «Seguridad» con la guía inglesa (marcada «en inglés»).
**No verificado:** el texto real en inglés (Wikivoyage devolvió 429 al grabarlo; sus pruebas usan texto sintético) y las guías de Valparaíso, Antofagasta y São Paulo (no se pudieron grabar; el código las consulta igual).
Wikivoyage limita el ritmo: no hay que consultarla por cada visita; la caché es obligatoria.
Nota de calidad: una prueba E2E de PulseMesh falló una vez de forma intermitente y pasó en 3 repeticiones; sin causa identificada.

## Integrado (2026-11-16): «Patrimonio y naturaleza» (Wikidata + GBIF)
`src/lib/context/{heritage,nature,entorno}.ts` → `GET /api/entorno?city=` → tarjeta en Mi día. Verificado EN VIVO en las 4 ciudades (10 bienes protegidos cada una; aves: SP 361.701 registros, Santiago 290.190, Valparaíso 102.675, Antofagasta 17.656).
Con datos reales aparecieron: filas repetidas de Wikidata (un bien con varias declaratorias → se agrupa) y registros de GBIF solo de género (se descartan).
Límites: Wikidata permite ~1 petición/min → caché de 7 días y copia vieja si limita. El orden del patrimonio es por idiomas de Wikipedia (popularidad), no calidad; las aves cuentan registros de observadores (sesgo: especies urbanas comunes primero, p. ej. paloma doméstica) y no traen nombre común.

## Integrado (2026-11-16): el contexto del día entra a «Revisar con datos de hoy»
`reviewTrip` recibe `context` (feriado, aire, UV) y emite hallazgos `contexto`: nombran las paradas afectadas y **nunca proponen ni aplican cambios** (la persona decide).
- Aire dañino (índice > 100): paradas al aire libre del día. UV muy alta (≥ 8): paradas al aire libre entre 11:00 y 16:00 (ventana fija, «horas centrales»). Feriado nacional: confirmar horarios de todas las paradas.
- Una categoría desconocida NO se asume al aire libre; una parada cancelada o de otro día no cuenta.
- Si el contexto no se pudo consultar, se declara en notas/avisos y en las fuentes (ok / fuera de alcance / no respondió).
- Verificado en vivo (ruta real `/api/trip-review`, São Paulo, 20-nov-2026): 4 fuentes «ok»; feriado + aire 151 + UV 10,4 reales.
Límite: el aire y UV son pronóstico de un modelo (hasta 4 días); el aviso lo dice. La ventana del UV es una heurística nuestra, no un dato de la fuente.
