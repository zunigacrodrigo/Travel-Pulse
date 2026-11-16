import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/entorno", () => {
  it("rechaza una ciudad desconocida o ausente", async () => {
    const call = (qs: string) => GET(new Request(`http://localhost/api/entorno?${qs}`, { headers: { "x-forwarded-for": `7.7.7.${Math.floor(Math.random() * 250)}` } }));
    expect((await call("city=atlantis")).status).toBe(400);
    expect((await call("")).status).toBe(400);
  });
});
