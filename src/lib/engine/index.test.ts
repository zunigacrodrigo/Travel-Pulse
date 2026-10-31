import { describe, expect, it } from "vitest";
import * as engine from "./index";

describe("API pública", () => {
  it("expone las funciones principales", () => {
    for (const fn of [
      "scoreDestination",
      "rankDestinations",
      "realityCheck",
      "compareDestinations",
      "surprise",
      "expectationGap",
      "aggregateGap",
      "isValidRatings",
      "usd",
      "num",
    ] as const) {
      expect(typeof engine[fn]).toBe("function");
    }
  });
});
