import { describe, expect, it } from "vitest";
import { DEMO_ACTIVITIES, DEMO_TRIP } from "./demo";
import { cityWorkspaceKey, getWeatherSuggestion, type CityWorkspace } from "./city-workspace";

function workspace(overrides: Partial<CityWorkspace> = {}): CityWorkspace {
  const park = { ...DEMO_ACTIVITIES[0]!, id: "osm-park", name: "Parque", category: "park", location: { latitude: -23.5, longitude: -46.6, placeId: "park" }, demoData: false };
  return {
    key: "sao paulo,brasil",
    city: "São Paulo",
    country: "Brasil",
    coordinates: { latitude: -23.55, longitude: -46.63 },
    timeZone: "America/Sao_Paulo",
    trip: DEMO_TRIP,
    activities: [park],
    places: [{ id: "museum", name: "Museu", category: "museum", latitude: -23.56, longitude: -46.65 }],
    precipitationProbability: 85,
    weatherSource: "Open-Meteo",
    weatherUpdatedAt: "2026-10-28T12:00:00.000Z",
    updatedAt: "2026-10-28T12:00:00.000Z",
    ...overrides,
  };
}

describe("city trip workspace", () => {
  it("normalizes city names for a stable per-city plan", () => {
    expect(cityWorkspaceKey("São Paulo", "Brasil")).toBe(cityWorkspaceKey("sao  paulo", "BRASIL"));
  });

  it("suggests a mapped indoor-category alternative when tomorrow's rain probability is high", () => {
    const suggestion = getWeatherSuggestion(workspace());
    expect(suggestion?.activity.name).toBe("Parque");
    expect(suggestion?.alternative.name).toBe("Museu");
    expect(suggestion?.rainProbability).toBe(85);
    expect(suggestion?.explanation).toContain("no están confirmados");
  });

  it("does not suggest a weather change below the high-rain threshold", () => {
    expect(getWeatherSuggestion(workspace({ precipitationProbability: 59 }))).toBeNull();
  });

  it("does not infer outdoor exposure from a generic attraction category", () => {
    const ambiguousActivity = { ...workspace().activities[0]!, category: "attraction" };
    expect(getWeatherSuggestion(workspace({ activities: [ambiguousActivity] }))).toBeNull();
  });
});
