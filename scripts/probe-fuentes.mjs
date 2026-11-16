// Sondeo de cobertura: ¿responde cada fuente nueva y qué trae para las 4 ciudades? Solo lectura, sin claves.
const CITIES = { "São Paulo": [-23.5505, -46.6333, "São Paulo"], Santiago: [-33.4489, -70.6693, "Santiago de Chile"], Valparaíso: [-33.0472, -71.6127, "Valparaíso"], Antofagasta: [-23.6509, -70.3975, "Antofagasta"] };
const UA = { "User-Agent": "TravelPulse-probe/0.1 (investigacion de cobertura)" };
async function get(url, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: c.signal }); const txt = await r.text(); return { status: r.status, txt }; }
  catch (e) { return { status: 0, txt: String(e.cause?.code ?? e.message) }; } finally { clearTimeout(t); }
}
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const rows = [];
const add = (fuente, ciudad, estado, detalle) => rows.push({ fuente, ciudad, estado, detalle });

for (const [name, [lat, lon, wv]] of Object.entries(CITIES)) {
  // Wikivoyage: ¿existe guía y cuánto trae?
  let r = await get(`https://es.wikivoyage.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=0&titles=${encodeURIComponent(name)}&format=json&redirects=1`);
  let d = j(r.txt); let p = d && Object.values(d.query?.pages ?? {})[0];
  if (r.status !== 200 || !p || p.missing !== undefined) { r = await get(`https://en.wikivoyage.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(wv)}&format=json&redirects=1`); d = j(r.txt); p = d && Object.values(d.query?.pages ?? {})[0]; add("Wikivoyage(en)", name, r.status === 200 && p && p.missing === undefined ? "OK" : `FALLA ${r.status}`, p?.extract ? `${p.extract.length} caracteres` : r.txt.slice(0, 60)); }
  else add("Wikivoyage(es)", name, "OK", `${p.extract?.length ?? 0} caracteres`);
  // Wikidata: patrimonio UNESCO en 40 km
  const q = `SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { SERVICE wikibase:around { ?x wdt:P625 ?l . bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "40" } ?x wdt:P1435 ?s }`;
  r = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, 25000); d = j(r.txt);
  add("Wikidata (patrimonio ≤40 km)", name, r.status === 200 ? "OK" : `FALLA ${r.status}`, r.status === 200 ? `${d?.results?.bindings?.[0]?.n?.value ?? "?"} bienes protegidos` : r.txt.slice(0, 60));
  // GBIF: observaciones de aves en 0.3° (~30 km)
  r = await get(`https://api.gbif.org/v1/occurrence/search?limit=0&classKey=212&decimalLatitude=${lat - 0.3},${lat + 0.3}&decimalLongitude=${lon - 0.3},${lon + 0.3}`); d = j(r.txt);
  add("GBIF (aves ≤30 km)", name, r.status === 200 ? "OK" : `FALLA ${r.status}`, r.status === 200 ? `${d?.count} observaciones` : r.txt.slice(0, 60));
  // OSM accesibilidad: lugares con wheelchair=* vía Nominatim no sirve; probamos Overpass
  r = await get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(`[out:json][timeout:20];nwr["wheelchair"](around:3000,${lat},${lon});out count;`)}`, 25000); d = j(r.txt);
  add("OSM wheelchair=* (3 km, Overpass)", name, r.status === 200 ? "OK" : `FALLA ${r.status}`, r.status === 200 ? `${d?.elements?.[0]?.tags?.total ?? "?"} elementos` : r.txt.slice(0, 60));
  // Waymarked Trails
  r = await get(`https://hiking.waymarkedtrails.org/api/v1/list/by_area?bbox=${lon - 0.3},${lat - 0.3},${lon + 0.3},${lat + 0.3}&limit=50`); d = j(r.txt);
  add("Waymarked Trails (rutas ≤30 km)", name, r.status === 200 ? "OK" : `FALLA ${r.status}`, r.status === 200 ? `${d?.results?.length ?? "?"} rutas` : r.txt.slice(0, 60));
  // OpenAQ v3 (suele exigir clave)
  r = await get(`https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=25000&limit=100`); d = j(r.txt);
  add("OpenAQ (estaciones ≤25 km)", name, r.status === 200 ? "OK" : `NECESITA CLAVE/FALLA ${r.status}`, r.status === 200 ? `${d?.results?.length} estaciones` : r.txt.slice(0, 50));
}
// Fuentes de alcance global
let r = await get("https://overpass-api.de/api/status"), d; add("Overpass (estado)", "—", r.status === 200 ? "OK" : `FALLA ${r.status}`, r.txt.slice(0, 80).replace(/\s+/g, " "));
r = await get("https://sacbe.dtpm.cl/"); add("DTPM (sitio)", "Santiago", r.status ? `HTTP ${r.status}` : "NO ALCANZABLE", r.status ? "" : r.txt);
r = await get("https://www.dtpm.cl/index.php/gtfs-vigente"); add("DTPM GTFS vigente", "Santiago", r.status ? `HTTP ${r.status}` : "NO ALCANZABLE", r.status ? `${r.txt.length} bytes de página` : r.txt);
r = await get("https://dadosabertos.urbis.pmsp.gov.br/api/3/action/package_list"); d = j(r.txt); add("Urbis CKAN (São Paulo)", "São Paulo", r.status === 200 ? "OK" : (r.status ? `HTTP ${r.status}` : "NO ALCANZABLE"), r.status === 200 ? `${d?.result?.length ?? "?"} conjuntos` : r.txt.slice(0, 60));
r = await get("https://api.mobilitydatabase.org/v1/gtfs_feeds?limit=1"); add("Mobility Database", "—", r.status === 200 ? "OK" : `NECESITA TOKEN/FALLA ${r.status}`, r.txt.slice(0, 60));
r = await get("https://app.ticketmaster.com/discovery/v2/events.json?countryCode=CL&size=1"); add("Ticketmaster Discovery", "CL", r.status === 200 ? "OK" : `NECESITA CLAVE ${r.status}`, r.txt.slice(0, 60));
r = await get("https://api.opentripmap.com/0.1/en/places/radius?radius=1000&lon=-70.66&lat=-33.44&limit=1"); add("OpenTripMap", "Santiago", r.status === 200 ? "OK" : `NECESITA CLAVE ${r.status}`, r.txt.slice(0, 60));
r = await get("https://firms.modaps.eosdis.nasa.gov/api/area/csv/DEMO/VIIRS_SNPP_NRT/-71,-34,-70,-33/1"); add("NASA FIRMS", "Santiago", r.status === 200 ? "OK" : `NECESITA CLAVE ${r.status}`, r.txt.slice(0, 60).replace(/\s+/g, " "));
r = await get("https://secure.geonames.org/searchJSON?q=Antofagasta&maxRows=1&username=demo"); add("GeoNames", "—", r.status === 200 && !r.txt.includes("status") ? "OK" : `NECESITA USUARIO ${r.status}`, r.txt.slice(0, 60));
r = await get("https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/&max-keys=5"); add("Overture (S3 público)", "—", r.status === 200 ? "OK" : (r.status ? `HTTP ${r.status}` : "NO ALCANZABLE"), r.status === 200 ? (r.txt.match(/release\/[\w.-]+\//g) ?? []).join(" ") : r.txt.slice(0, 60));
r = await get("https://test.api.amadeus.com/v1/shopping/activities"); add("Amadeus Activities", "—", `HTTP ${r.status} (exige registro)`, r.txt.slice(0, 50));
for (const x of rows) console.log(`${x.estado.padEnd(26)} ${x.fuente.padEnd(36)} ${x.ciudad.padEnd(12)} ${x.detalle}`);
