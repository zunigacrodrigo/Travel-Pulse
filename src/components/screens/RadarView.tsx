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
import { HAZARD_LABEL } from "@/lib/sources/gdacs";
import { summarizeRadar, type RadarSummary, type RiskLevel } from "@/lib/sources/radar-summary";
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


const polar = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)] as const;
function arc(a0: number, a1: number) {
  const [x0, y0] = polar(100, 100, 78, a0);
  const [x1, y1] = polar(100, 100, 78, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 78 78 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Medidor del nivel más alto observado entre los destinos. No es un promedio ni una predicción. */
function RiskGauge({ summary }: { summary: RadarSummary }) {
  const id = useId();
  const levels: RiskLevel[] = [1, 2, 3, 4];
  const max = summary.maxLevel;
  const needle = max ? polar(100, 100, 62, 180 - (max - 0.5) * 45) : null;
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl bg-panel p-4 text-panel-fg">
      <h2 id={`${id}-h`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-panel-mid">
        Nivel más alto observado
      </h2>
      <svg viewBox="0 0 200 118" role="img" aria-label={max ? `Medidor: nivel ${max} de 4, ${LEVEL_LABEL[max]}` : "Medidor sin datos"} className="mx-auto mt-2 h-auto w-full max-w-[240px]">
        {levels.map((l) => (
          <path key={l} d={arc(180 - (l - 1) * 45 - 2, 180 - l * 45 + 2)} fill="none" stroke={LEVEL_FILL[l]} strokeWidth={14} strokeLinecap="butt" opacity={max === l ? 1 : 0.35} />
        ))}
        {needle ? <line x1={100} y1={100} x2={needle[0]} y2={needle[1]} stroke="var(--c-panel-fg)" strokeWidth={3} strokeLinecap="round" /> : null}
        <circle cx={100} cy={100} r={6} fill="var(--c-panel-fg)" />
      </svg>
      <p className="text-center font-display text-[22px] font-extrabold leading-tight">{max ? `Nivel ${max} · ${LEVEL_LABEL[max]}` : "Sin datos"}</p>
      <ul className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] text-panel-fg2" aria-label="Destinos por nivel">
        {levels.map((l) => (
          <li key={l} className="rounded-lg bg-white/5 py-1.5">
            <b className="block text-[15px] text-panel-fg">{summary.counts[l]}</b>
            Nivel {l}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-4 text-panel-mid">Es el nivel más alto entre {summary.withData} destinos con dato, según el aviso del FCDO. No es una predicción.</p>
    </section>
  );
}

function ActiveAlerts({ summary }: { summary: RadarSummary }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl bg-panel p-4 text-panel-fg">
      <h2 id={`${id}-h`} className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-panel-mid">
        Alertas activas <span className="rounded-full bg-white/10 px-2 py-0.5 text-panel-fg">{summary.alerts.length}</span>
      </h2>
      {summary.alerts.length === 0 ? (
        <p className="mt-3 text-[13px] text-panel-fg2">No hay avisos de nivel 2 o más ni sismos relevantes cerca de los destinos.</p>
      ) : (
        <ul className="mt-3 flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
          {summary.alerts.map((a) => (
            <li key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-2.5" style={{ borderLeft: `4px solid ${a.level ? LEVEL_FILL[a.level] : "var(--c-panel-fg)"}` }}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-panel-mid">{a.kind === "advisory" ? `Aviso · nivel ${a.level}` : a.kind === "quake" ? "Sismo" : "Evento natural"}</p>
              {a.href && a.kind === "hazard" ? (
                <a href={a.href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold underline underline-offset-2">{a.title}</a>
              ) : a.href ? (
                <Link href={a.href} className="text-[13px] font-bold underline-offset-2 hover:underline">{a.title}</Link>
              ) : (
                <p className="text-[13px] font-bold">{a.title}</p>
              )}
              <p className="text-[12px] leading-4 text-panel-fg2">{a.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
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
      {d.hazards.length > 0 ? (
        <ul aria-label={`Eventos naturales cerca de ${d.name}`} className="mt-1 flex flex-col gap-0.5 text-[13px] leading-[1.5] text-fg2">
          {d.hazards.map((h) => (
            <li key={h.id}>
              <b>{HAZARD_LABEL[h.type]}</b> ({h.alertLevel === "Red" ? "alerta roja" : h.alertLevel === "Orange" ? "alerta naranja" : "informativo"}) a {h.distanceKm} km
              {h.reportUrl ? (
                <>
                  {" · "}
                  <a href={h.reportUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">GDACS</a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
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
  const summary = useMemo(() => summarizeRadar(radar.data?.destinations ?? []), [radar.data]);
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
            <ul aria-label="Estado de las fuentes" className="flex flex-col gap-2">
              <StatusChip name="Avisos FCDO" s={radar.data.status.fcdo} />
              <StatusChip name="Sismos USGS" s={radar.data.status.usgs} />
              <StatusChip name="Desastres GDACS" s={radar.data.status.gdacs} />
            </ul>
            <div className="flex flex-col gap-4">
              <RadarMap data={radar.data} />
              <div className="flex flex-col gap-4">
                <RiskGauge summary={summary} />
                <ActiveAlerts summary={summary} />
              </div>
            </div>
            <section aria-labelledby="radar-list">
              <h2 id="radar-list" className="mb-2 font-display text-[18px] font-extrabold">
                Destinos por nivel de riesgo
              </h2>
              <ul className="flex flex-col gap-3">
                {rows.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </ul>
            </section>
            <p className="text-[11px] leading-4 text-mid">
              El aviso del FCDO es la posición del gobierno del Reino Unido, no una verdad universal: contrástalo con la cancillería de tu país. Los
              sismos vienen del USGS (M4,5+) y los ciclones, inundaciones, volcanes e incendios del GDACS (ONU y UE); se informan, no se predicen. Generado: {when(radar.data.generatedAt)}.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
