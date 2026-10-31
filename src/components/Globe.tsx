"use client";

import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";
import { getGlobe } from "@/lib/client/api";
import { monthName } from "@/lib/client/format";
import { useAsync, usePrefersReducedMotion } from "@/lib/client/hooks";
import { scoreColor } from "@/lib/client/score";
import type { GlobeResponse } from "@/lib/types";

const W = 350;
const H = 212;
const R = 94;
/** Centro del globo: Sudamérica. */
const CENTER_LON = -62;
const CENTER_LAT = -15;
const MAX_DX = 45;
const MAX_DY = 25;

interface World extends Topology {
  objects: { land: GeometryCollection; countries: GeometryCollection };
}
const world = worldData as unknown as World;
const LAND = feature(world, world.objects.land);
const BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b);
const GRATICULE = geoGraticule10();

interface Pin {
  id: string;
  name: string;
  score: number | null;
  x: number;
  y: number;
}

interface Placed extends Pin {
  label: { x: number; y: number; anchor: "start" | "end" } | null;
}

/** Posiciona etiquetas a derecha o izquierda del pin evitando solapes (voraz, por score). */
function placeLabels(pins: Pin[], r: number): Placed[] {
  const boxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = pins.map((p) => ({
    x0: p.x - r,
    y0: p.y - r,
    x1: p.x + r,
    y1: p.y + r,
  }));
  const hit = (a: { x0: number; y0: number; x1: number; y1: number }) =>
    boxes.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);

  const order = [...pins].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const labels = new Map<string, Placed["label"]>();
  for (const p of order) {
    const width = p.name.length * 5.7 + 2;
    const candidates: Array<{ side: "start" | "end"; dy: number }> = [
      { side: "start", dy: 0 },
      { side: "end", dy: 0 },
      { side: "start", dy: -r - 4 },
      { side: "end", dy: -r - 4 },
    ];
    let chosen: Placed["label"] = null;
    for (const c of candidates) {
      const lx = c.side === "start" ? p.x + r + 4 : p.x - r - 4;
      const ly = p.y + c.dy;
      const box =
        c.side === "start"
          ? { x0: lx, x1: lx + width, y0: ly - 7, y1: ly + 7 }
          : { x0: lx - width, x1: lx, y0: ly - 7, y1: ly + 7 };
      if (box.x0 < 4 || box.x1 > W - 4 || box.y0 < 2 || box.y1 > H - 2) continue;
      if (hit(box)) continue;
      boxes.push(box);
      chosen = { x: lx, y: ly + 3.8, anchor: c.side };
      break;
    }
    labels.set(p.id, chosen);
  }
  return pins.map((p) => ({ ...p, label: labels.get(p.id) ?? null }));
}

interface Props {
  origin: string;
  month: number;
}

/** Globo ortográfico real (d3-geo + world-atlas) centrado en Sudamérica, con pines por score. */
export function Globe({ origin, month }: Props) {
  const reduced = usePrefersReducedMotion();
  const globe = useAsync<GlobeResponse>((signal) => getGlobe(origin, month, signal), `globe-${origin}-${month}`);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const offsetRef = useRef(offset);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const projection = useMemo(
    () =>
      geoOrthographic()
        .scale(R)
        .translate([W / 2, H / 2])
        .clipAngle(90)
        .rotate([-CENTER_LON - offset.dx, -CENTER_LAT - offset.dy]),
    [offset],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const gdata = globe.data;
  const points = useMemo(() => gdata?.points ?? [], [gdata]);
  const pinR = 10;
  /* Solo los 6 mejores llevan número y nombre; el resto es un punto, para que el globo se lea. */
  const featured = useMemo(
    () =>
      new Set(
        [...points]
          .filter((p) => p.score != null)
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 14)
          .map((p) => p.id),
      ),
    [points],
  );
  const center: [number, number] = [CENTER_LON + offset.dx, CENTER_LAT + offset.dy];

  const placed = useMemo(() => {
    const pins: Pin[] = [];
    for (const p of points) {
      if (geoDistance([p.lon, p.lat], center) > Math.PI / 2 - 0.08) continue;
      const xy = projection([p.lon, p.lat]);
      if (!xy) continue;
      pins.push({ id: p.id, name: p.name, score: p.score, x: xy[0], y: xy[1] });
    }
    // Los mejores puntajes primero; se omite un pin destacado si choca con otro ya puesto.
    const ordered = [...pins].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const chosen: Pin[] = [];
    for (const p of ordered) {
      if (chosen.length >= 6 || p.score == null || !featured.has(p.id)) continue;
      if (chosen.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < pinR * 2 + 4)) continue;
      chosen.push(p);
    }
    const ids = new Set(chosen.map((p) => p.id));
    const top = placeLabels(chosen, pinR);
    const rest = pins.filter((p) => !ids.has(p.id)).map((p) => ({ ...p, label: null }));
    return { top, rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, projection, pinR, featured]);

  const stopSpring = () => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  };

  const springBack = () => {
    stopSpring();
    const from = offsetRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 550);
      const k = 1 - Math.pow(1 - t, 3);
      setOffset({ dx: from.dx * (1 - k), dy: from.dy * (1 - k) });
      raf.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    stopSpring();
    drag.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.dx, oy: offsetRef.current.dy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.max(-MAX_DX, Math.min(MAX_DX, d.ox - (e.clientX - d.x) * 0.3));
    const dy = Math.max(-MAX_DY, Math.min(MAX_DY, d.oy + (e.clientY - d.y) * 0.3));
    setOffset({ dx, dy });
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    if (!reduced) springBack();
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = 10;
    const o = offsetRef.current;
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    if (e.key === "ArrowLeft") setOffset({ ...o, dx: clamp(o.dx - step, MAX_DX) });
    else if (e.key === "ArrowRight") setOffset({ ...o, dx: clamp(o.dx + step, MAX_DX) });
    else if (e.key === "ArrowUp") setOffset({ ...o, dy: clamp(o.dy - step, MAX_DY) });
    else if (e.key === "ArrowDown") setOffset({ ...o, dy: clamp(o.dy + step, MAX_DY) });
    else if (e.key === "Home" || e.key === "Escape") setOffset({ dx: 0, dy: 0 });
    else return;
    e.preventDefault();
  };

  const off = offset.dx !== 0 || offset.dy !== 0;
  const landD = path(LAND) ?? "";
  const bordersD = path(BORDERS) ?? "";
  const gratD = path(GRATICULE) ?? "";
  const heading = `Oportunidad por destino en ${monthName(month)}`;

  return (
    <section
      aria-label={heading}
      aria-busy={globe.status === "loading"}
      className="panel relative aspect-[350/200] w-full overflow-hidden rounded-[18px] bg-panel"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full touch-pan-y select-none"
        tabIndex={0}
        role="application"
        aria-label="Globo interactivo. Usa las flechas del teclado para girarlo."
        aria-roledescription="globo"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        <defs>
          <radialGradient id="tp-globe-grad" cx="40%" cy="35%" r="80%">
            <stop offset="0" stopColor="#1b3250" />
            <stop offset="1" stopColor="#0f2036" />
          </radialGradient>
        </defs>
        <circle cx={W / 2} cy={H / 2} r={R} fill="url(#tp-globe-grad)" stroke="#2a4668" strokeWidth={1.5} />
        <path d={gratD} fill="none" stroke="#24405f" strokeWidth={0.7} />
        <path d={landD} fill="#35577d" />
        <path d={bordersD} fill="none" stroke="#1f3b5c" strokeWidth={0.5} />

        <g aria-hidden="true">
          {placed.rest.map((p) => (
            <circle key={p.id} cx={p.x} cy={p.y} r={3.5} fill={p.score == null ? "#8FA3BA" : scoreColor(p.score)} opacity={0.85} />
          ))}
        </g>
        <g fontFamily="var(--font-archivo), Archivo, sans-serif" fontWeight={800} fontSize={pinR > 8 ? 10 : 8} textAnchor="middle">
          {placed.top.map((p) => (
            <g key={p.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={pinR}
                fill={p.score == null ? "#14233A" : scoreColor(p.score)}
                stroke={p.score == null ? "#8FA3BA" : "none"}
                strokeDasharray={p.score == null ? "2 2" : undefined}
              />
              <text x={p.x} y={p.y + (pinR > 8 ? 3.5 : 2.8)} fill={p.score == null ? "#c5d0dc" : "#0B1626"}>
                {p.score == null ? "–" : Math.round(p.score)}
              </text>
            </g>
          ))}
        </g>
        <g fontFamily="var(--font-instrument), 'Instrument Sans', sans-serif" fontSize={11} fill="#F2F5F8">
          {placed.top.map((p) =>
            p.label ? (
              <text key={p.id} x={p.label.x} y={p.label.y} textAnchor={p.label.anchor}>
                {p.name}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      <p className="pointer-events-none absolute right-3.5 top-3 w-24 text-right text-[12px] leading-[1.4] text-panel-mid">{heading}</p>
      <ul className="pointer-events-none absolute bottom-3 left-3.5 flex flex-col gap-1 text-[11px] text-panel-fg2">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-[#46d4f2]" />
          70 o más
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-[#FFC857]" />
          50 a 69
        </li>
      </ul>
      {off && reduced ? (
        <button
          type="button"
          onClick={() => setOffset({ dx: 0, dy: 0 })}
          className="absolute bottom-1 right-2 min-h-11 px-3 text-[12px] font-semibold text-signal underline"
        >
          Centrar
        </button>
      ) : null}

      {/* Equivalente accesible del mapa: lista de destinos con su puntaje. */}
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.id}>
            {p.name}: {p.score == null ? "información limitada" : `puntaje ${Math.round(p.score)}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
