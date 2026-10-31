import type { DestinationLive } from "./overlay";

export type RiskLevel = 1 | 2 | 3 | 4;

export interface RadarAlert {
  id: string;
  kind: "advisory" | "quake";
  level: RiskLevel | null;
  title: string;
  detail: string;
  href: string | null;
}

export interface RadarSummary {
  counts: Record<RiskLevel, number>;
  withData: number;
  /** Nivel más alto entre los destinos con dato; null si ninguno lo tiene. No es un promedio ni una predicción. */
  maxLevel: RiskLevel | null;
  alerts: RadarAlert[];
}

const mag = (m: number) => m.toFixed(1).replace(".", ",");

/** Resume el Radar solo con lo observado: sin ponderar ni inventar un puntaje global. */
export function summarizeRadar(destinations: DestinationLive[]): RadarSummary {
  const counts: Record<RiskLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let maxLevel: RiskLevel | null = null;
  let withData = 0;
  const alerts: RadarAlert[] = [];
  for (const d of destinations) {
    if (d.riskLevel !== null) {
      counts[d.riskLevel] += 1;
      withData += 1;
      if (maxLevel === null || d.riskLevel > maxLevel) maxLevel = d.riskLevel;
      if (d.riskLevel >= 2) {
        alerts.push({
          id: `adv-${d.id}`, kind: "advisory", level: d.riskLevel, href: `/destino/${d.id}`,
          title: `${d.name}, ${d.country}`,
          detail: d.riskOrigin === "live" ? `Aviso oficial FCDO · consultado ${d.riskObservedAt}` : `Dato de nuestra base (${d.riskObservedAt}); sin verificar en vivo`,
        });
      }
    }
    if (d.quakes.count > 0 && d.quakes.maxMag !== null) {
      alerts.push({
        id: `quake-${d.id}`, kind: "quake", level: null, href: `/destino/${d.id}`,
        title: `Sismo cerca de ${d.name}`,
        detail: `M${mag(d.quakes.maxMag)} a ${d.quakes.strongest?.distanceKm ?? "?"} km · últimos ${d.quakes.days} días · USGS`,
      });
    }
  }
  alerts.sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.title.localeCompare(b.title, "es"));
  return { counts, withData, maxLevel, alerts };
}
