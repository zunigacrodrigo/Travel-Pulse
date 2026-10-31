import { describe, expect, it } from "vitest";
import { capitalize, joinEs, lowerFirst, meters, num, pct, signedPct, usd } from "./format";

describe("format (español, miles con punto y decimales con coma)", () => {
  it("usd", () => {
    expect(usd(1180)).toBe("US$1.180");
    expect(usd(1234567.6)).toBe("US$1.234.568");
    expect(usd(0)).toBe("US$0");
    expect(usd(-140)).toBe("-US$140");
  });
  it("num", () => {
    expect(num(4.5, 1)).toBe("4,5");
    expect(num(12345)).toBe("12.345");
    expect(num(-0.04, 1)).toBe("0,0");
    expect(num(-1234.56, 2)).toBe("-1.234,56");
    expect(num(Number.NaN)).toBe("–");
  });
  it("pct, signedPct, meters", () => {
    expect(pct(55)).toBe("55%");
    expect(signedPct(15)).toBe("+15%");
    expect(signedPct(-8)).toBe("-8%");
    expect(signedPct(0)).toBe("0%");
    expect(meters(3400)).toBe("3.400 m");
  });
  it("joinEs, capitalize, lowerFirst", () => {
    expect(joinEs([])).toBe("");
    expect(joinEs(["a"])).toBe("a");
    expect(joinEs(["a", "b"])).toBe("a y b");
    expect(joinEs(["a", "b", "c"])).toBe("a, b y c");
    expect(capitalize("ñandú")).toBe("Ñandú");
    expect(capitalize("")).toBe("");
    expect(lowerFirst("Saturación")).toBe("saturación");
    expect(lowerFirst("")).toBe("");
  });
});
