import type { PosterPalette } from "@/lib/types";

export const NEUTRAL_POSTER: PosterPalette = {
  sky: "#D9ECF7",
  sun: "#D23A26",
  far: "#2C3E55",
  near: "#0B1626",
  accent: "#46d4f2",
  motif: "mountains",
};

export type PosterVariant = "hero" | "header" | "thumb" | "card";

/** Lienzo (viewBox) por variante; el SVG se recorta con "slice". */
const CANVAS: Record<PosterVariant, [number, number]> = {
  hero: [400, 200],
  header: [400, 270],
  thumb: [100, 100],
  card: [200, 130],
};

interface Props {
  poster: PosterPalette;
  variant?: PosterVariant;
  className?: string;
  /** Nombre accesible; si se omite el afiche es decorativo. */
  title?: string;
}

/** Afiche plano vectorial generado desde la paleta y el motivo del destino. */
export function DestinationPoster({ poster, variant = "hero", className = "", title }: Props) {
  const [w, h] = CANVAS[variant];
  const x = (f: number) => +(f * w).toFixed(2);
  const y = (f: number) => +(f * h).toFixed(2);
  const pt = (fx: number, fy: number) => `${x(fx)} ${y(fy)}`;
  const { sky, sun, far, near, accent, motif } = poster;
  const sw = Math.max(1.5, w / 130);

  let body: React.ReactNode;
  switch (motif) {
    case "sea":
      body = (
        <>
          <circle cx={x(0.72)} cy={y(0.3)} r={Math.min(w, h) * 0.12} fill={sun} />
          <rect y={y(0.56)} width={w} height={h - y(0.56)} fill={far} />
          <path
            d={`M0 ${y(0.7)} Q${x(0.25)} ${y(0.64)} ${x(0.5)} ${y(0.7)} T${x(1)} ${y(0.7)} V${h} H0Z`}
            fill={near}
          />
          <path
            d={`M${x(0.1)} ${y(0.85)} H${x(0.4)} M${x(0.5)} ${y(0.9)} H${x(0.85)}`}
            stroke={accent}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        </>
      );
      break;
    case "hills":
      body = (
        <>
          <circle cx={x(0.3)} cy={y(0.3)} r={Math.min(w, h) * 0.13} fill={sun} />
          <path d={`M0 ${y(0.7)} Q${x(0.25)} ${y(0.44)} ${x(0.52)} ${y(0.66)} T${x(1)} ${y(0.52)} V${h} H0Z`} fill={far} />
          <path d={`M0 ${y(0.9)} Q${x(0.35)} ${y(0.72)} ${x(0.7)} ${y(0.88)} T${x(1)} ${y(0.8)} V${h} H0Z`} fill={near} />
          <path
            d={`M${x(0.12)} ${y(0.95)} H${x(0.42)}`}
            stroke={accent}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
      break;
    case "city": {
      const tops = [0.52, 0.38, 0.6, 0.3, 0.5, 0.42, 0.58, 0.34, 0.55];
      const bw = w / tops.length;
      body = (
        <>
          <circle cx={x(0.75)} cy={y(0.26)} r={Math.min(w, h) * 0.13} fill={sun} />
          {tops.map((t, i) => (
            <rect key={`f${i}`} x={i * bw + bw * 0.08} y={y(t)} width={bw * 0.84} height={h - y(t)} fill={far} />
          ))}
          {tops.map((t, i) => (
            <rect key={`n${i}`} x={i * bw + bw * 0.2} y={y(t + 0.22)} width={bw * 0.6} height={h - y(t + 0.22)} fill={near} />
          ))}
          {tops.map((t, i) => (
            <rect key={`w${i}`} x={i * bw + bw * 0.4} y={y(t + 0.3)} width={bw * 0.2} height={sw * 1.4} fill={accent} />
          ))}
        </>
      );
      break;
    }
    case "desert":
      body = (
        <>
          <circle cx={x(0.5)} cy={y(0.42)} r={Math.min(w, h) * 0.22} fill={sun} />
          <path d={`M0 ${y(0.78)} Q${x(0.3)} ${y(0.55)} ${x(0.6)} ${y(0.74)} T${x(1)} ${y(0.66)} V${h} H0Z`} fill={far} />
          <path d={`M0 ${y(0.92)} Q${x(0.4)} ${y(0.76)} ${x(0.75)} ${y(0.9)} T${x(1)} ${y(0.86)} V${h} H0Z`} fill={near} />
          <path d={`M${x(0.15)} ${y(0.96)} H${x(0.5)}`} stroke={accent} strokeWidth={sw} strokeLinecap="round" fill="none" />
        </>
      );
      break;
    case "mountains":
    default:
      body = (
        <>
          <circle cx={x(0.73)} cy={y(0.37)} r={Math.min(w, h) * 0.2} fill={sun} />
          <path
            d={`M0 ${y(0.75)} L${pt(0.175, 0.42)} L${pt(0.3, 0.6)} L${pt(0.475, 0.28)} L${pt(0.65, 0.65)} L${pt(0.8, 0.47)} L${pt(1, 0.7)} V${h} H0Z`}
            fill={far}
          />
          <path
            d={`M0 ${h} V${y(0.8)} L${pt(0.225, 0.64)} L${pt(0.45, 0.78)} L${pt(0.7, 0.6)} L${pt(1, 0.79)} V${h}Z`}
            fill={near}
          />
          <path
            d={`M${x(0.1)} ${y(0.88)} H${x(0.4)} M${x(0.17)} ${y(0.84)} H${x(0.47)} M${x(0.5)} ${y(0.86)} H${x(0.85)} M${x(0.57)} ${y(0.82)} H${x(0.92)}`}
            stroke={accent}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      className={`block h-full w-full ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width={w} height={h} fill={sky} />
      {body}
    </svg>
  );
}
