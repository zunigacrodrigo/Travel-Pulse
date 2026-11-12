import { describe, expect, it } from "vitest";
import { CITIES } from "./cities";
import { dayInputSchema } from "./service";
import { parseDayQuery } from "./query";

describe("ciudades del piloto de Mi día", () => {
  it("incluye Antofagasta con coordenadas dentro de la ciudad y zona horaria de Chile", () => {
    const c = CITIES["antofagasta-cl"]!;
    expect(c.name).toBe("Antofagasta");
    expect(c.country).toBe("Chile");
    expect(c.center.lat).toBeGreaterThan(-23.75); expect(c.center.lat).toBeLessThan(-23.55);
    expect(c.center.lon).toBeGreaterThan(-70.5); expect(c.center.lon).toBeLessThan(-70.3);
    expect(c.timezone).toBe("America/Santiago");
  });
  it("la clave de cada ciudad coincide con su entrada", () => {
    for (const [k, c] of Object.entries(CITIES)) expect(c.key).toBe(k);
  });
  it("el API acepta Antofagasta y el enlace profundo también", () => {
    const ok = dayInputSchema.safeParse({ city: "antofagasta-cl", date: "2026-11-20", startMin: 600, endMin: 1200, wishes: [{ kind: "museo" }] });
    expect(ok.success).toBe(true);
    expect(parseDayQuery({ city: "antofagasta-cl", w: "pub" }, "2026-11-20").city).toBe("antofagasta-cl");
  });
});
