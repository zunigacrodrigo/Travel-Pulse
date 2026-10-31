import { NextResponse } from "next/server";

export const revalidate = 900;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, next: { revalidate: 900 } });
  if (!response.ok) throw new Error(`Fuente externa respondió ${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = (searchParams.get("city") ?? "Santiago").trim();
  if (requested.length < 2 || requested.length > 100) {
    return NextResponse.json({ ok: false, error: "Escribe el nombre de una ciudad válido." }, { status: 400 });
  }

  try {
    // Geocoding makes coverage global instead of maintaining a hard-coded city whitelist.
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.search = new URLSearchParams({ name: requested, count: "5", language: "es", format: "json" }).toString();
    const geocode = await fetchJson(geocodeUrl.toString());
    const results = geocode?.results ?? [];
    if (!results.length) {
      return NextResponse.json({ ok: false, error: `No encontré una ciudad llamada “${requested}”. Prueba con ciudad y país, por ejemplo “Santiago, Chile”.` }, { status: 404 });
    }
    const normalized = requested.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const match = results.find((r: { name?: string; country?: string; admin1?: string }) => `${r.name ?? ""} ${r.country ?? ""} ${r.admin1 ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized)) ?? results[0];
    const city = String(match.name ?? requested);
    const country = String(match.country ?? "País no especificado");
    const lat = Number(match.latitude), lon = Number(match.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("La fuente de geocodificación devolvió coordenadas inválidas.");

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(lat), longitude: String(lon),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: "7", timezone: "auto",
    }).toString();

    const overpassQuery = `[out:json][timeout:12];(node(around:3500,${lat},${lon})[tourism~"attraction|museum|viewpoint|artwork"];node(around:3500,${lat},${lon})[amenity~"cafe|restaurant|marketplace|arts_centre"];node(around:3500,${lat},${lon})[leisure~"park|garden"];way(around:3500,${lat},${lon})[tourism~"attraction|museum|viewpoint"];way(around:3500,${lat},${lon})[leisure~"park|garden"];);out center tags 24;`;
    const [weatherResult, placesResult] = await Promise.allSettled([
      fetchJson(weatherUrl.toString()),
      fetchJson("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "TravelPulse/1.0 travel-intelligence" }, body: new URLSearchParams({ data: overpassQuery }).toString() }),
    ]);
    const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
    const rawPlaces = placesResult.status === "fulfilled" ? placesResult.value?.elements ?? [] : [];
    const places = rawPlaces.map((item: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }) => {
      const tags = item.tags ?? {};
      return { id: `osm-${item.id}`, name: tags.name ?? tags["name:en"] ?? tags.tourism ?? tags.amenity ?? tags.leisure ?? "Lugar de interés", category: tags.tourism ?? tags.amenity ?? tags.leisure ?? tags.shop ?? "punto de interés", lat: item.lat ?? item.center?.lat ?? null, lon: item.lon ?? item.center?.lon ?? null, website: tags.website ?? tags["contact:website"] ?? null, source: "OpenStreetMap" };
    }).filter((place: { lat: number | null; lon: number | null }) => place.lat !== null && place.lon !== null);

    return NextResponse.json({
      ok: true, city, country, coordinates: { lat, lon }, requestedCity: requested,
      generatedAt: new Date().toISOString(),
      weather: weather ? { current: weather.current, daily: weather.daily, timezone: weather.timezone, source: "Open-Meteo", status: "live" } : null,
      places,
      sources: [
        { name: "Open-Meteo Geocoding", url: "https://open-meteo.com/", status: "ok", purpose: "Resolver cualquier ciudad a coordenadas" },
        { name: "Open-Meteo Weather", url: "https://open-meteo.com/", status: weather ? "ok" : "unavailable", purpose: "Tiempo actual y previsión" },
        { name: "OpenStreetMap / Overpass", url: "https://www.openstreetmap.org/copyright", status: placesResult.status === "fulfilled" ? "ok" : "unavailable", purpose: "Lugares de interés y servicios mapeados" },
      ],
      limitations: ["La cobertura de lugares depende de los datos mapeados en cada zona.", "El clima es un modelo meteorológico, no una alerta oficial.", "Los lugares no confirman horarios, apertura, afluencia ni seguridad en tiempo real."],
    }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? `No se pudo consultar la ciudad: ${error.message}` : "No se pudieron consultar las fuentes externas." }, { status: 502 });
  }
}
