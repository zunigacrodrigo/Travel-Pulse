import { describe, expect, it } from "vitest";
import { parseDayTripId } from "./dayTrip";

describe("parseDayTripId", () => {
  it("lee la ciudad y la fecha de un viaje armado en Mi día", () => {
    expect(parseDayTripId("dia-sao-paulo-br-2026-11-05")).toEqual({ city: "sao-paulo-br", date: "2026-11-05" });
    expect(parseDayTripId("dia-antofagasta-cl-2026-11-20")).toEqual({ city: "antofagasta-cl", date: "2026-11-20" });
  });
  it.each(["importado-1", "dia-atlantis-2026-11-05", "dia-sao-paulo-br-mañana", "dia-sao-paulo-br-2026-11-05-x", "", "DIA-sao-paulo-br-2026-11-05"])("rechaza %j", (id) => {
    expect(parseDayTripId(id)).toBeNull();
  });
});
