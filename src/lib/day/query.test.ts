import { describe, expect, it } from "vitest";
import { dayHref, parseDayQuery } from "./query";

describe("enlace profundo de Mi día", () => {
  it("ida y vuelta conserva lo pedido", () => {
    const href = dayHref({ city: "sao-paulo-br", date: "2026-11-05", start: "11:35", end: "22:00", kinds: ["pub", "museo"] });
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseDayQuery(sp, "2000-01-01")).toEqual({ city: "sao-paulo-br", date: "2026-11-05", start: "11:35", end: "22:00", kinds: ["pub", "museo"], pace: null, go: true });
  });
  it("ignora ciudad, hora, fecha y deseos inválidos", () => {
    const p = parseDayQuery({ city: "atlantis", date: "mañana", from: "25:00", to: "x", w: "zoo,,museo,museo", go: "1" }, "2026-11-06");
    expect(p).toMatchObject({ city: "sao-paulo-br", date: "2026-11-06", start: "11:00", end: "23:00", kinds: ["museo"], go: true });
  });
  it("el ritmo viaja en el enlace y se valida", () => {
    const href = dayHref({ city: "sao-paulo-br", date: "2026-11-05", start: "11:00", end: "22:00", kinds: ["museo"], pace: "tranquilo" });
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseDayQuery(sp, "2000-01-01").pace).toBe("tranquilo");
    expect(parseDayQuery({ ...sp, pace: "frenético" }, "2000-01-01").pace).toBeNull();
    expect(parseDayQuery({ w: "museo" }, "2000-01-01").pace).toBeNull();
  });
  it("no arma solo si no pidió nada válido", () => {
    expect(parseDayQuery({ go: "1", w: "zoo" }, "2026-11-06").go).toBe(false);
  });
});
