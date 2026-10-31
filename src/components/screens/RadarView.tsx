"use client";

import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import Link from "next/link";
import { useId, useMemo } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldData from "world-atlas/countries-110m.json";
import { getRadar, type RadarResponse } from "@/lib/client/api";
import { useAsync } from "@/lib/client/hooks";
import type { FeedStatus } from "@/lib/sources/live";
import type { DestinationLive } from "@/lib/sources/overlay";
import { PageHeader } from "../ui/PageHeader";
import { Button } from "../ui/Button";

interface World extends Topology {
  objects: { land: GeometryCollection };
}
const world = worldData as unknown as World;
const LAND = feature(world, world.objects.land);
const GRATICULE = geoGraticule10();
const W = 700;
const H = 360;

const LEVEL_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Normal",
  2: "Precaución",
  3: "Evitar viajes no esenciales",
  4: "No viajar",
};
/** Color + forma (número) para no depender solo del color. */
const LEVEL_FILL: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--c-good)",
  2: "var(--c-warn-fill)",
  3: "var(--c-stamp-fill)",
  4: "var(--c-alert)",
};

const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "nunca");
const mag = (m: number) => m.toFixed(1).replace(".", ",");

function StatusChip({ name, s }: { name: string; s: FeedStatus }) {
  const text = s.state === "ok" ? "al día" : s.state === "stale" ? "desactualizada" : "sin conexión";
  return (
    <li className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px]">
      <p className="font-semibold">
        {name}: <span className={s.state === "ok" ? "text-good" : "text-alert"}>{text}</span>
      </p>
      <p className="text-mid">
        Última consulta: {when(s.fetchedAt)}
        {s.count ? ` · ${s.count} registros` : ""}
      </p>
      {s.error ? <p className="text-alert">{s.error}</p> : null}
    </li>
  );
}

function RadarMap({ data }: { data: RadarResponse }) {
  const id = useId();
  const { path, project } = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([W, H], { type: "Sphere" });
    return { path: geoPath(projection), project: projection };
  }, []);
  const quakeDots = data.notableQuakes.map((q) => ({ q, xy: project([q.lon, q.lat]) }));
  return (
    <figure className="rounded-2xl bg-panel p-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} className="h-auto w-full">
        <title id={`${id}-t`}>
          Mapa mundial con {data.destinations.length} destinos coloreados por nivel de riesgo y {data.notableQuakes.length} sismos
          recientes de magnitud 5,5 o más.
        </title>
        <path d={path({ type: "Sphere" }) ?? ""} fill="var(--c-tile-panel)" />
        <path d={path(GRATICULE) ?? ""} fill="none" stroke="var(--c-track-panel)" strokeWidth={0.4} />
        <path d={path(LAND) ?? ""} fill="var(--c-tile-off)" opacity={0.55} />
        {quakeDots.map(({ q, xy }) =>
          xy ? (
            <circle key={q.id} cx={xy[0]} cy={xy[1]} r={2 + (q.mag - 5) * 3} fill="none" stroke="var(--c-panel-fg)" strokeWidth={1.2} opacity={0.85}>
              <title>{`M${mag(q.mag)} · ${q.place}`}</title>
            </circle>
          ) : null,
        )}
        {data.destinations.map((d) => {
          const xy = project([d.lon, d.lat]);
          if (!xy || d.riskLevel === null) return null;
          return (
            <g key={d.id} transform={`translate(${xy[0]} ${xy[1]})`}>
              <circle r={8} fill={LEVEL_FILL[d.riskLevel]} stroke="var(--c-panel-fg)" strokeWidth={1.2} />
              <text y={3.6} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">
                {d.riskLevel}
              </text>
              <title>{`${d.name}: nivel ${d.riskLevel} de 4`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="px-2 pb-1 pt-2 text-[11px] leading-4 text-panel-mid">
        Círculo con número: nivel de riesgo del destino (1 normal … 4 no viajar). Aro blanco: sismo M5,5+ de los últimos 14 días.
      </figcaption>
    </figure>
  );
}

function Row({ d }: { d: DestinationLive }) {
  const q = d.quakes;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/destino/${d.id}`} className="font-display text-[17px] font-extrabold underline-offset-2 hover:underline">
            {d.name}
          </Link>
          <p className="text-[12px] text-mid">{d.country}</p>
        </div>
        {d.riskLevel !== null ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-1 text-[12px] font-bold">
            <span aria-hidden="true" className="grid size-5 place-items-center rounded-full text-[11px] text-white" style={{ background: LEVEL_FILL[d.riskLevel] }}>
              {d.riskLevel}
            </span>
            {LEVEL_LABEL[d.riskLevel]}
          </span>
        ) : (
          <span className="text-[12px] text-mid">Sin dato</span>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-[1.5] text-fg2">
        {d.riskOrigin === "live" ? (
          <>
            Aviso del FCDO (Reino Unido), consultado el {d.riskObservedAt}
            {d.advisoryUpdatedAt ? `; el aviso se actualizó el ${d.advisoryUpdatedAt.slice(0, 10)}` : ""}.{" "}
            {d.advisoryUrl ? (
              <a href={d.advisoryUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                Ver aviso original
              </a>
            ) : null}
          </>
        ) : (
          <span className="text-alert">Dato de nuestra base ({d.riskObservedAt}); no se pudo verificar en vivo.</span>
        )}
      </p>
      <p className="mt-1 text-[13px] leading-[1.5] text-fg2">
        {q.count === 0
          ? `Sin sismos M${mag(q.minMag)}+ a menos de ${q.radiusKm} km en ${q.days} días.`
          : `${q.count} sismo${q.count > 1 ? "s" : ""} M${mag(q.minMag)}+ a menos de ${q.radiusKm} km en ${q.days} días; el mayor, M${mag(q.maxMag ?? 0)} a ${q.strongest?.distanceKm} km.`}
      </p>
    </li>
  );
}

export function RadarView() {
  const radar = useAsync<RadarResponse>((signal) => getRadar(signal), "radar");
  const rows = useMemo(
    () =>
      [...(radar.data?.destinations ?? [])].sort(
        (a, b) => (b.riskLevel ?? 0) - (a.riskLevel ?? 0) || b.quakes.count - a.quakes.count || a.name.localeCompare(b.name, "es"),
      ),
    [radar.data],
  );

  return (
    <main className="flex flex-1 flex-col gap-4 pb-8">
      <PageHeader backHref="/" title="Radar en vivo" subtitle="Riesgo oficial y sismos, con fuente y hora" />
      <div className="flex flex-col gap-4 px-5">
        {radar.status === "loading" && !radar.data ? (
          <div aria-busy="true">
            <p role="status" className="sr-only">
              Consultando fuentes
            </p>
            <div className="tp-pulse h-56 rounded-2xl bg-surface" />
          </div>
        ) : null}
        {radar.status === "error" ? (
          <div role="alert" className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[14px] font-semibold">No se pudo cargar el Radar.</p>
            <p className="mt-1 text-[13px] text-fg2">Tus datos y búsquedas no se ven afectados.</p>
            <Button size="sm" className="mt-3" onClick={radar.retry}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {radar.data ? (
          <>
            {!radar.data.liveEnabled ? (
              <p role="status" className="rounded-xl border border-line bg-surface p-3 text-[13px] text-fg2">
                Las fuentes en vivo están desactivadas en este servidor; se muestran los datos de nuestra base.
              </p>
            ) : null}
            <ul aria-label="Estado de las fuentes" className="grid gap-2 sm:grid-cols-2">
              <StatusChip name="Avisos FCDO" s={radar.data.status.fcdo} />
              <StatusChip name="Sismos USGS" s={radar.data.status.usgs} />
            </ul>
            <RadarMap data={radar.data} />
            <section aria-labelledby="radar-list">
              <h2 id="radar-list" className="mb-2 font-display text-[18px] font-extrabold">
                Destinos por nivel de riesgo
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {rows.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </ul>
            </section>
            <p className="text-[11px] leading-4 text-mid">
              El aviso del FCDO es la posición del gobierno del Reino Unido, no una verdad universal: contrástalo con la cancillería de tu país. Los
              sismos vienen del USGS (M4,5+) y se informan, no se predicen. Generado: {when(radar.data.generatedAt)}.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
