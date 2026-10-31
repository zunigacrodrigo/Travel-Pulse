import { z } from "zod";
import { activitySchema, tripSchema, type Activity, type Trip } from "./types";

export const CITY_WORKSPACES_KEY = "travel-pulse.city-workspaces.v1";

export const cityPlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  website: z.string().nullable().optional(),
});
export type CityPlace = z.infer<typeof cityPlaceSchema>;

export const cityWorkspaceSchema = z.object({
  key: z.string(),
  city: z.string().min(1),
  country: z.string().min(1),
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
  timeZone: z.string().default("UTC"),
  trip: tripSchema,
  activities: z.array(activitySchema).max(100),
  places: z.array(cityPlaceSchema).max(100),
  precipitationProbability: z.number().min(0).max(100).nullable(),
  weatherSource: z.string().nullable(),
  weatherUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type CityWorkspace = z.infer<typeof cityWorkspaceSchema>;

export function cityWorkspaceKey(city: string, country: string): string {
  return `${city},${country}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function defaultTrip(city: string, country: string, timeZone: string): Trip {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(tomorrow);
  const date = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
  const startAt = new Date(`${date}T12:00:00.000Z`).toISOString();
  const endAt = new Date(Date.parse(startAt) + 9 * 60 * 60_000).toISOString();
  return {
    id: `city-${cityWorkspaceKey(city, country).replace(/[^a-z0-9]+/g, "-")}`,
    destination: `${city}, ${country}`,
    startAt,
    endAt,
    timeZone: timeZone || "UTC",
    budget: { amount: 0, currency: "USD" },
    travelers: 1,
  };
}

export function cityPlaceToActivity(place: CityPlace, observedAt: string): Activity {
  const unknownEvidence = { status: "unknown" as const, sourceId: null, observedAt: null, expiresAt: null };
  const mappedEvidence = { status: "estimated" as const, sourceId: "openstreetmap", observedAt, expiresAt: null };
  return activitySchema.parse({
    id: `osm-${place.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    name: place.name,
    category: place.category,
    location: { latitude: place.latitude, longitude: place.longitude, placeId: place.id },
    durationMinutes: 60,
    importance: "normal",
    cost: { amount: null, currency: "USD", basis: "unknown" },
    travelMinutesFromPrevious: null,
    travelEvidence: unknownEvidence,
    hoursEvidence: unknownEvidence,
    costEvidence: mappedEvidence,
    demoData: false,
  });
}

function readAll(): Record<string, CityWorkspace> {
  try {
    const raw = localStorage.getItem(CITY_WORKSPACES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
      const result = cityWorkspaceSchema.safeParse(value);
      return result.success ? [[key, result.data]] : [];
    }));
  } catch {
    return {};
  }
}

function writeAll(workspaces: Record<string, CityWorkspace>) {
  localStorage.setItem(CITY_WORKSPACES_KEY, JSON.stringify(workspaces));
}

export function loadCityWorkspace(city: string, country: string): CityWorkspace | null {
  if (typeof localStorage === "undefined") return null;
  return readAll()[cityWorkspaceKey(city, country)] ?? null;
}

export function saveCityPlace(input: {
  city: string;
  country: string;
  coordinates: { latitude: number; longitude: number };
  timeZone: string;
  precipitationProbability: number | null;
  weatherSource: string | null;
  weatherUpdatedAt: string | null;
  places: CityPlace[];
  place: CityPlace;
  observedAt: string;
}): { workspace: CityWorkspace; added: boolean } {
  const all = readAll();
  const key = cityWorkspaceKey(input.city, input.country);
  const previous = all[key];
  const activity = cityPlaceToActivity(input.place, input.observedAt);
  const alreadyAdded = previous?.activities.some((item) => item.id === activity.id) ?? false;
  const now = new Date().toISOString();
  const workspace = cityWorkspaceSchema.parse({
    key,
    city: input.city,
    country: input.country,
    coordinates: input.coordinates,
    timeZone: input.timeZone || previous?.timeZone || "UTC",
    trip: previous?.trip ?? defaultTrip(input.city, input.country, input.timeZone),
    activities: alreadyAdded ? previous!.activities : [...(previous?.activities ?? []), activity],
    places: input.places,
    precipitationProbability: input.precipitationProbability,
    weatherSource: input.weatherSource,
    weatherUpdatedAt: input.weatherUpdatedAt,
    updatedAt: now,
  });
  writeAll({ ...all, [key]: workspace });
  return { workspace, added: !alreadyAdded };
}

export function updateCityContext(input: {
  city: string;
  country: string;
  coordinates: { latitude: number; longitude: number };
  timeZone: string;
  precipitationProbability: number | null;
  weatherSource: string | null;
  weatherUpdatedAt: string | null;
  places: CityPlace[];
}): CityWorkspace | null {
  const all = readAll();
  const key = cityWorkspaceKey(input.city, input.country);
  const existing = all[key];
  if (!existing) return null;
  const workspace = cityWorkspaceSchema.parse({ ...existing, ...input, key, updatedAt: new Date().toISOString() });
  writeAll({ ...all, [key]: workspace });
  return workspace;
}

export function saveCityActivities(workspace: CityWorkspace, activities: Activity[]): void {
  const all = readAll();
  const updated = cityWorkspaceSchema.parse({ ...workspace, activities, updatedAt: new Date().toISOString() });
  writeAll({ ...all, [workspace.key]: updated });
}

export function saveCityTrip(workspace: CityWorkspace, trip: Trip): void {
  const all = readAll();
  const updated = cityWorkspaceSchema.parse({ ...workspace, trip, updatedAt: new Date().toISOString() });
  writeAll({ ...all, [workspace.key]: updated });
}

export interface WeatherSuggestion {
  activity: Activity;
  alternative: CityPlace;
  rainProbability: number;
  explanation: string;
}

export function getWeatherSuggestion(workspace: CityWorkspace): WeatherSuggestion | null {
  const rainProbability = workspace.precipitationProbability;
  if (rainProbability == null || rainProbability < 60) return null;
  const outdoor = workspace.activities.find((activity) => /park|viewpoint|beach|nature_reserve|garden|trail/i.test(activity.category ?? ""));
  if (!outdoor) return null;
  const alreadyAdded = new Set(workspace.activities.map((activity) => activity.location.placeId));
  const alternative = workspace.places.find((place) => /museum|cafe|restaurant|arts_centre|library|theatre/i.test(place.category) && !alreadyAdded.has(place.id));
  if (!alternative) return null;
  return {
    activity: outdoor,
    alternative,
    rainProbability,
    explanation: `El pronóstico consultado indica ${rainProbability}% de probabilidad de lluvia para el día del plan. Podrías cambiar una actividad al aire libre por una opción cultural o gastronómica; el interior, el horario, la apertura y el traslado no están confirmados.`,
  };
}
