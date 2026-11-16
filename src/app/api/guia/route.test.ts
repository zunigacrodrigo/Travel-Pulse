import { describe, expect, it } from "vitest";
import { GET } from "./route";

const call = (qs: string) => GET(new Request(`http://localhost/api/guia?${qs}`, { headers: { "x-forwarded-for": `8.8.8.${Math.floor(Math.random() * 250)}` } }));

describe("GET /api/guia", () => {
  it("rechaza una ciudad desconocida o ausente", async () => {
    expect((await call("city=atlantis")).status).toBe(400);
    expect((await call("")).status).toBe(400);
  });
});
