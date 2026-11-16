import { describe, expect, it } from "vitest";
import { GET } from "./route";

const call = (qs: string) => GET(new Request(`http://localhost/api/contexto?${qs}`, { headers: { "x-forwarded-for": `9.9.9.${Math.floor(Math.random() * 250)}` } }));

describe("GET /api/contexto", () => {
  it("rechaza una ciudad que no existe", async () => expect((await call("city=atlantis&date=2026-11-18")).status).toBe(400));
  it("rechaza una fecha mal escrita o imposible", async () => {
    expect((await call("city=santiago-cl&date=18-11-2026")).status).toBe(400);
    expect((await call("city=santiago-cl&date=2026-13-45")).status).toBe(400);
    expect((await call("city=santiago-cl")).status).toBe(400);
  });
});
