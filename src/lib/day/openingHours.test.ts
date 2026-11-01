import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/nominatim-sp-real.json";
import { clock, earliestFit, fits, parseOpeningHours, statusAt, weekdayOf, windowsOn } from "./openingHours";

const TH = 3, FR = 4, SA = 5, SU = 6, MO = 0;
const m = (h: number, min = 0) => h * 60 + min;

describe("parseOpeningHours con horarios reales de São Paulo", () => {
  const masp = parseOpeningHours("Tu-Su 10:00-18:00; Th 10:00-20:00")!;
  it("MASP: el jueves a las 11:00 está abierto hasta las 20:00 (la regla de jueves reemplaza a la general)", () => {
    expect(statusAt(masp, TH, m(11))).toEqual({ state: "open", closesAt: m(20) });
  });
  it("MASP: el viernes a las 18:30 ya cerró; el lunes está cerrado todo el día", () => {
    expect(statusAt(masp, FR, m(18, 30)).state).toBe("closed");
    expect(statusAt(masp, MO, m(12))).toEqual({ state: "closed", opensAt: null });
  });
  it("rango que cruza el domingo: We-Mo incluye sábado y domingo", () => {
    const p = parseOpeningHours("We-Mo 10:00-17:30")!;
    expect(statusAt(p, SU, m(12)).state).toBe("open");
    expect(statusAt(p, 1, m(12)).state).toBe("closed"); // martes
  });
  it("un horario que cierra después de medianoche informa la hora real de cierre (03:30), no 00:00", () => {
    const pub = parseOpeningHours("Tu-Fr 18:00-03:30; Sa 20:00-04:30")!;
    expect(statusAt(pub, TH, m(18, 30))).toEqual({ state: "open", closesAt: m(27, 30) });
    expect(clock(m(27, 30))).toBe("03:30");
    expect(fits(pub, TH, m(23), 90)).toBe(true); // la visita cruza la medianoche dentro del mismo tramo
  });
  it("lista de días y dos tramos en el mismo día", () => {
    const p = parseOpeningHours("We,Sa,Su 10:00-12:00,13:00-17:00")!;
    expect(statusAt(p, SA, m(12, 30))).toEqual({ state: "closed", opensAt: m(13) });
    expect(statusAt(p, SA, m(14)).state).toBe("open");
    expect(statusAt(p, TH, m(11)).state).toBe("closed");
  });
  it("cruce de medianoche: el viernes 19:00-02:00 sigue abierto el sábado a la 01:00", () => {
    const p = parseOpeningHours("Mo-Th off; Fr 19:00-02:00; Sa 15:00-02:00; Su 16:00-24:00")!;
    expect(statusAt(p, SA, m(1))).toEqual({ state: "open", closesAt: m(2) });
    expect(statusAt(p, TH, m(21)).state).toBe("closed");
    expect(statusAt(p, SU, m(23)).state).toBe("open");
  });
  it("reglas separadas por coma y feriados (PH) se interpretan y se avisa que los feriados se desconocen", () => {
    const p = parseOpeningHours("Mo 19:00-23:00, Tu-Fr 12:00-15:00,19:00-23:30, Sa 12:30-16:00,19:00-23:30, Su 12:30-16:00")!;
    expect(statusAt(p, TH, m(13)).state).toBe("open");
    expect(statusAt(p, TH, m(16)).state).toBe("closed");
    expect(parseOpeningHours("Mo-Fr 11:30-15:00; Sa,PH 12:00-16:00")!.holidayCaveat).toBe(true);
  });
  it("24/7 y reglas con horas para toda la semana", () => {
    expect(statusAt(parseOpeningHours("24/7")!, MO, m(3)).state).toBe("open");
    expect(statusAt(parseOpeningHours("10:00-18:00")!, 2, m(11)).state).toBe("open");
  });
});

describe("lo que NO se puede interpretar se declara «sin confirmar» (null)", () => {
  it.each([
    ["sin horas", "We-Su"],
    ["comentario", '18:00-24:00 open "Delivery"'],
    ["mes", "Mar-Oct Mo-Fr 09:00-17:00"],
    ["amanecer", "sunrise-sunset"],
    ["semanas", "week 1-3 Mo-Fr 09:00-17:00"],
    ["basura", "abierto todos los dias"],
    ["vacío", ""],
  ])("%s", (_n, s) => expect(parseOpeningHours(s)).toBeNull());
  it("null y undefined", () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
  });
  it("horas imposibles", () => expect(parseOpeningHours("Mo 25:00-30:00")).toBeNull());
});

describe("fits / earliestFit / windowsOn", () => {
  const p = parseOpeningHours("Tu-Su 10:00-18:00; Th 10:00-20:00")!;
  it("una visita debe caber entera dentro del horario", () => {
    expect(fits(p, TH, m(11), 90)).toBe(true);
    expect(fits(p, TH, m(19), 90)).toBe(false); // terminaría a las 20:30
    expect(fits(p, FR, m(17), 90)).toBe(false);
  });
  it("primer momento posible a partir de una hora", () => {
    expect(earliestFit(p, TH, m(8), 60)).toBe(m(10));
    expect(earliestFit(p, TH, m(11), 60)).toBe(m(11));
    expect(earliestFit(p, TH, m(19, 30), 60)).toBeNull();
    expect(earliestFit(p, MO, m(10), 60)).toBeNull();
  });
  it("incluye lo que venía abierto de la noche anterior", () => {
    const night = parseOpeningHours("Fr 19:00-02:00")!;
    expect(windowsOn(night, SA)).toEqual([{ start: 0, end: m(2) }]);
  });
});

describe("weekdayOf", () => {
  it("5 de noviembre de 2026 es jueves, sin depender de la zona horaria", () => {
    expect(weekdayOf("2026-11-05")).toBe(TH);
    expect(weekdayOf("2026-11-08")).toBe(SU);
    expect(weekdayOf("2026-11-02")).toBe(MO);
  });
});

describe("todos los horarios reales del fixture", () => {
  const all = [...fixture.museum, ...fixture.restaurant, ...fixture.pub].map((x) => (x.extratags as Record<string, string>).opening_hours).filter(Boolean);
  it("ninguno lanza error; los que no se interpretan quedan como null", () => {
    expect(all.length).toBeGreaterThan(20);
    let parsed = 0;
    for (const s of all) { const r = parseOpeningHours(s); if (r) parsed++; }
    expect(parsed).toBeGreaterThanOrEqual(all.length - 4);
  });
});
