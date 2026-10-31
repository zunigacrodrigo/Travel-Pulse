import { describe, expect, it } from "vitest";
import type { Dataset, Destination, TripRequest } from "@/lib/types";
import {
  BASE_REQUEST,
  NOW,
  SOURCES,
  makeDataset,
  makeDestination,
  makeMonthly,
  makePrice,
  makeTrend,
  sourced,
  tags,
  type MonthlyInput,
} from "./__fixtures__/dataset";
import { ageInDays, assessSourced, findDestination, findPrice, freshness, mean, round1 } from "./data";
import {
  CURATED_TAGS_QUALITY,
  climaFactor,
  climateScore,
  conectividadFactor,
  connectivityScore,
  estimateCost,
  evaluateFactors,
  experienciaFactor,
  factorLabel,
  precioFactor,
  priceBaseScore,
  priceBonus,
  riesgoFactor,
  saturacionFactor,
  temporadaFactor,
  tendenciaFactor,
  type FactorContext,
} from "./factors";

interface SingleOptions {
  destination?: Partial<Destination>;
  monthly?: MonthlyInput;
  flight?: number | null;
  usual?: number | null;
  noPrice?: boolean;
  trend?: { price: number | null; interest: number | null } | null;
  req?: Partial<TripRequest>;
  sources?: Dataset["sources"];
}

/** Contexto con un único destino "AAA" configurable. */
function single(opts: SingleOptions = {}): FactorContext {
  const destination = makeDestination("AAA", "Prueba", opts.destination);
  const dataset: Dataset = {
    destinations: [destination],
    monthly: [makeMonthly("AAA", opts.monthly ?? {})],
    prices: opts.noPrice ? [] : [makePrice("AAA", opts.flight === undefined ? 400 : opts.flight, opts.usual === undefined ? 400 : opts.usual)],
    trends: opts.trend === null ? [] : [makeTrend("AAA", opts.trend ? opts.trend.price : 0, opts.trend ? opts.trend.interest : 0)],
    sources: opts.sources ?? SOURCES,
  };
  return { req: { ...BASE_REQUEST, ...opts.req }, destination, dataset, now: NOW };
}

describe("calidad q_i = fiabilidad × frescura", () => {
  it("frescura 1 dentro de maxAgeDays y decae lineal a 0 en 3×maxAgeDays", () => {
    expect(freshness(0, 7)).toBe(1);
    expect(freshness(7, 7)).toBe(1);
    expect(freshness(14, 7)).toBeCloseTo(0.5);
    expect(freshness(21, 7)).toBe(0);
    expect(freshness(100, 7)).toBe(0);
  });
  it("q usa la fiabilidad de la fuente y marca datos vencidos", () => {
    const fresh = assessSourced(sourced(1, "amadeus", "2026-10-06"), SOURCES, NOW);
    expect(fresh.quality).toBeCloseTo(0.95);
    expect(fresh.stale).toBe(false);
    expect(fresh.sourceName).toBe("Amadeus");
    const old = assessSourced(sourced(1, "amadeus", "2026-09-24T12:00:00Z"), SOURCES, NOW);
    expect(old.quality).toBeCloseTo(0.95 * 0.5);
    expect(old.stale).toBe(true);
  });
  it("valor null, fuente desconocida, fecha inválida o dato ausente dan q = 0", () => {
    expect(assessSourced(sourced(null, "amadeus"), SOURCES, NOW).quality).toBe(0);
    const unknown = assessSourced(sourced(1, "nope"), SOURCES, NOW);
    expect(unknown.quality).toBe(0);
    expect(unknown.stale).toBe(true);
    expect(unknown.sourceName).toBe("Fuente desconocida");
    expect(assessSourced(sourced(1, "amadeus", "no-es-fecha"), SOURCES, NOW).quality).toBe(0);
    expect(assessSourced(undefined, SOURCES, NOW).quality).toBe(0);
    expect(ageInDays("2026-10-20", NOW)).toBe(0);
  });
  it("helpers", () => {
    expect(mean([])).toBe(0);
    expect(round1(-0.04)).toBe(0);
    expect(round1(1.25)).toBe(1.3);
    const ds = makeDataset();
    expect(findDestination(ds, "CUZ")?.name).toBe("Cusco");
    ds.prices.push(makePrice("CUZ", 500, 700, "2026-10-07"));
    expect(findPrice(ds, "CUZ", "SCL", 11)?.flightUsd.value).toBe(500);
  });
});

describe("factor Precio (25%)", () => {
  // presupuesto 1.000, 10 días, 1 viajero, costo diario 30 → estadía 300
  const req = { budgetUsd: 1000, days: 10 };
  const monthly = { daily: 30 };
  const value = (flight: number, usual: number | null = flight): number | null =>
    precioFactor(single({ req, monthly, flight, usual })).value;

  it("100 si el costo total es ≤ 50% del presupuesto", () => {
    expect(value(200)).toBe(100); // 500 = 50%
    expect(value(100)).toBe(100); // 40%
  });
  it("lineal entre 50% y 100%", () => {
    expect(value(300)).toBe(80); // 60%
    expect(value(450)).toBe(50); // 75%
  });
  it("0 al 100% y sobre el 100%", () => {
    expect(value(700)).toBe(0); // 100%
    expect(value(800)).toBe(0); // 110%
    expect(priceBaseScore(1000, 0)).toBe(0);
  });
  it("bonus lineal: 0 en el precio habitual, 10 puntos con 10% o más bajo lo habitual", () => {
    expect(priceBonus(null)).toBe(0);
    expect(priceBonus(-0.2)).toBe(0);
    expect(priceBonus(0.05)).toBeCloseTo(5);
    expect(priceBonus(0.1)).toBeCloseTo(10);
    expect(priceBonus(0.3)).toBeCloseTo(10);
    expect(value(450, 500)).toBe(60); // 50 + 10
    expect(value(200, 400)).toBe(100); // tope 100
  });
  it("detalle factual en español", () => {
    const f = precioFactor(single({ req: { budgetUsd: 1500, days: 8 }, monthly: { daily: 70 }, flight: 610, usual: 700 }));
    expect(f.detail).toBe("US$1.170 de US$1.500, vuelo 13% bajo lo habitual");
    expect(f.strongPhrase).toBe("vuelo bajo lo habitual");
    const over = precioFactor(single({ req, monthly, flight: 440, usual: 400 }));
    expect(over.detail).toBe("US$740 de US$1.000, vuelo 10% sobre lo habitual");
    expect(over.strongPhrase).toBe("cabe holgado en el presupuesto");
  });
  it("costo = vuelo × viajeros + diario × días × viajeros; fechas flexibles = vuelo −15%", () => {
    const ctx = single({ req: { travelers: 2, days: 5, flexibleDates: true }, monthly: { daily: 50 }, flight: 1000 });
    const cost = estimateCost(ctx);
    expect(cost.flightUsd).toBe(1700);
    expect(cost.stayUsd).toBe(500);
    expect(cost.totalUsd).toBe(2200);
  });
  it("null si falta el vuelo o el costo diario, con etiqueta legible", () => {
    const noFlight = precioFactor(single({ noPrice: true }));
    expect(noFlight.value).toBeNull();
    expect(noFlight.missingLabel).toBe("Precio de vuelos");
    expect(noFlight.detail).toBe("Sin precio de vuelo desde SCL");
    const noDaily = precioFactor(single({ monthly: { daily: null } }));
    expect(noDaily.missingLabel).toBe("Costo diario");
    expect(noDaily.quality).toBe(0);
    const none = precioFactor(single({ flight: null, monthly: { daily: null } }));
    expect(none.missingLabel).toBe("Precio de vuelos y costo diario");
  });
});

describe("factor Experiencia (20%)", () => {
  const destination = { tags: tags([5, 4, 5, 4, 0, 3, 1, 3]) };
  it("promedio de afinidad de los intereses elegidos (0..5 → 0..100)", () => {
    const f = experienciaFactor(single({ destination, req: { interests: ["cultura", "comida"] } }));
    expect(f.value).toBe(90);
    expect(f.detail).toBe("Afinidad 4,5/5 en cultura y comida");
    expect(f.quality).toBeCloseTo(0.9);
    expect(f.sourceName).toBe("Curaduría Travel Pulse");
    expect(f.observedAt).toBe("2026-10-06"); // fecha de la curaduría mensual (season)
  });
  it("sin intereses usa la media de todas las etiquetas", () => {
    const f = experienciaFactor(single({ destination }));
    expect(f.value).toBe(Math.round((25 / 8 / 5) * 100));
    expect(f.detail).toContain("sin intereses elegidos");
  });
  it("'desconocido' premia destinos poco masivos vía su etiqueta", () => {
    const masivo = experienciaFactor(single({ destination, req: { interests: ["desconocido"] } }));
    const oculto = experienciaFactor(single({ destination: { tags: tags([3, 3, 3, 3, 3, 3, 5, 3]) }, req: { interests: ["desconocido"] } }));
    expect(masivo.value).toBe(20);
    expect(oculto.value).toBe(100);
  });
  it("con más de 3 intereses resume la cantidad; sin fuente de curaduría usa calidad por defecto", () => {
    const f = experienciaFactor(
      single({ destination, req: { interests: ["cultura", "comida", "aventura", "lujo"] }, sources: SOURCES.filter((s) => s.id !== "curaduria-tp") }),
    );
    expect(f.detail).toBe("Afinidad 4,3/5 en 4 intereses");
    expect(f.quality).toBe(CURATED_TAGS_QUALITY);
  });
});

describe("factor Clima (15%)", () => {
  it("normaliza temperatura, lluvia y viento contra el rango agradable", () => {
    expect(climateScore(22, 20, 10)).toBe(100);
    expect(climateScore(6, 20, 10)).toBeCloseTo(70); // 12 °C bajo el mínimo → temp 40
    expect(climateScore(22, 300, 10)).toBeCloseTo(70); // lluvia en 0
    expect(climateScore(22, 175, 10)).toBeCloseTo(85); // lluvia a la mitad
    expect(climateScore(22, 20, 50)).toBeCloseTo(80); // viento en 0
    expect(climateScore(40, 400, 60)).toBeCloseTo(15);
  });
  it("detalle y null cuando falta", () => {
    const f = climaFactor(single({ monthly: { climate: { tempC: 22, rainMm: 35, windKmh: 15 } } }));
    expect(f.detail).toBe("22 °C, 35 mm de lluvia, viento 15 km/h");
    expect(climaFactor(single({ monthly: { climate: null } })).value).toBeNull();
  });
});

describe("factores Temporada y Saturación (10% c/u): índices mensuales", () => {
  it("pasan el índice tal cual con etiqueta", () => {
    const cases: Array<[number, string, string]> = [
      [80, "Muy buen mes (índice 80)", "Poca gente (índice 80)"],
      [55, "Buen mes (índice 55)", "Afluencia media (índice 55)"],
      [30, "Mes regular (índice 30)", "Mucha gente (índice 30)"],
      [10, "Mes poco recomendable (índice 10)", "Mucha gente (índice 10)"],
    ];
    for (const [v, season, sat] of cases) {
      const ctx = single({ monthly: { season: v, saturation: v } });
      expect(temporadaFactor(ctx).value).toBe(v);
      expect(temporadaFactor(ctx).detail).toBe(season);
      expect(saturacionFactor(ctx).value).toBe(v);
      expect(saturacionFactor(ctx).detail).toBe(sat);
    }
  });
  it("null cuando falta el índice", () => {
    const ctx = single({ monthly: { season: null, saturation: null } });
    expect(temporadaFactor(ctx).value).toBeNull();
    expect(saturacionFactor(ctx).value).toBeNull();
    expect(saturacionFactor(ctx).missingLabel).toBe("Saturación");
  });
});

describe("factor Conectividad (10%)", () => {
  it("vuelo directo, menos horas y más frecuencia suben el valor", () => {
    expect(connectivityScore(true, 2, 14)).toBe(100);
    expect(connectivityScore(false, 20, 0)).toBe(0);
    expect(connectivityScore(false, 11, 7)).toBeCloseTo(30);
    expect(connectivityScore(true, 4, 14)).toBeGreaterThan(connectivityScore(false, 4, 14));
  });
  it("detalle con formato español", () => {
    const conn = { SCL: sourced({ directFlights: true, flightHours: 4.5, weeklyFrequency: 21 }, "openflights") };
    expect(conectividadFactor(single({ destination: { connectivity: conn } })).detail).toBe("Vuelo directo, 4,5 h, 21 vuelos por semana");
    const scale = { SCL: sourced({ directFlights: false, flightHours: 9, weeklyFrequency: 7 }, "openflights") };
    const f = conectividadFactor(single({ destination: { connectivity: scale } }));
    expect(f.detail).toBe("Con escala, 9 h, 7 vuelos por semana");
    expect(f.strongPhrase).toBe("buena conexión");
  });
  it("null si no hay entrada o dato para el origen", () => {
    expect(conectividadFactor(single({ destination: { connectivity: {} } })).value).toBeNull();
    const nullValue = { SCL: sourced<{ directFlights: boolean; flightHours: number; weeklyFrequency: number }>(null, "openflights") };
    expect(conectividadFactor(single({ destination: { connectivity: nullValue } })).value).toBeNull();
  });
});

describe("factor Riesgo (5%)", () => {
  it("nivel 1→100, 2→70, 3→35, 4→0", () => {
    const expected: Record<1 | 2 | 3 | 4, number> = { 1: 100, 2: 70, 3: 35, 4: 0 };
    for (const level of [1, 2, 3, 4] as const) {
      const f = riesgoFactor(single({ destination: { riskLevel: sourced<1 | 2 | 3 | 4>(level, "cancilleria") } }));
      expect(f.value).toBe(expected[level]);
    }
  });
  it("detalle con la primera razón y null sin dato", () => {
    const f = riesgoFactor(
      single({ destination: { riskLevel: sourced<1 | 2 | 3 | 4>(2, "cancilleria"), riskReasons: ["Protestas puntuales"] } }),
    );
    expect(f.detail).toBe("Nivel 2 de 4: protestas puntuales");
    expect(riesgoFactor(single()).detail).toBe("Nivel 1 de 4");
    expect(riesgoFactor(single({ destination: { riskLevel: sourced<1 | 2 | 3 | 4>(null, "cancilleria") } })).value).toBeNull();
  });
  it("no presenta como vigente una alerta oficial cuyo dato ya venció", () => {
    const context = single({ destination: { riskLevel: sourced<1 | 2 | 3 | 4>(1, "cancilleria", "2026-09-01"), riskReasons: ["Sin alertas oficiales vigentes"] } });
    const result = riesgoFactor({ ...context, now: new Date("2026-10-28T12:00:00Z") });
    expect(result.stale).toBe(true);
    expect(result.detail).toContain("dato antiguo");
    expect(result.detail).not.toContain("Sin alertas oficiales vigentes");
  });
});

describe("factor Tendencia (5%)", () => {
  it("50 = plano; baja de precio y alza de interés suben", () => {
    expect(tendenciaFactor(single({ trend: { price: 0, interest: 0 } })).value).toBe(50);
    expect(tendenciaFactor(single({ trend: { price: -20, interest: 40 } })).value).toBe(100);
    expect(tendenciaFactor(single({ trend: { price: 20, interest: -40 } })).value).toBe(0);
    expect(tendenciaFactor(single({ trend: { price: -50, interest: 100 } })).value).toBe(100);
  });
  it("con un solo componente usa ese y baja la calidad a la mitad", () => {
    const f = tendenciaFactor(single({ trend: { price: -10, interest: null } }));
    expect(f.value).toBe(63);
    expect(f.quality).toBeCloseTo(0.4);
    expect(f.detail).toBe("Precio -10% en 30 días");
    expect(tendenciaFactor(single({ trend: { price: -8, interest: 15 } })).detail).toBe("Precio -8% e interés +15% en 30 días");
  });
  it("null sin datos de tendencia", () => {
    expect(tendenciaFactor(single({ trend: null })).value).toBeNull();
    expect(tendenciaFactor(single({ trend: { price: null, interest: null } })).value).toBeNull();
  });
});

describe("evaluateFactors", () => {
  it("devuelve los 8 factores con valores 0..100 o null", () => {
    const evals = evaluateFactors(single());
    expect(Object.keys(evals)).toHaveLength(8);
    for (const e of Object.values(evals)) {
      if (e.value !== null) {
        expect(e.value).toBeGreaterThanOrEqual(0);
        expect(e.value).toBeLessThanOrEqual(100);
      }
    }
    expect(factorLabel("saturacion")).toBe("Saturación");
  });
});
