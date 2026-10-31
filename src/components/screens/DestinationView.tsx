"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { loadRequestId } from "@/lib/client/cache";
import { ApiError, getDestination, postClick } from "@/lib/client/api";
import { capitalize, formatUsd, monthName, plural } from "@/lib/client/format";
import { useAsync } from "@/lib/client/hooks";
import { parseRequest } from "@/lib/client/query";
import { INTEREST_LABELS, type DestinationDetailResponse, type TripRequest } from "@/lib/types";
import { AffiliateBar } from "../AffiliateBar";
import { ConfidenceBar } from "../ConfidenceBar";
import { DestinationPoster } from "../DestinationPoster";
import { FactorRow } from "../FactorRow";
import { FlapScore } from "../FlapScore";
import { RealityCheckTable } from "../RealityCheckTable";
import { SaveButton } from "../SaveButton";
import { ErrorPanel } from "../StatePanels";
import { BackButton } from "../ui/BackButton";
import { Button } from "../ui/Button";
import { Warning } from "../ui/Icons";

function tripLine(r: TripRequest): string {
  const interests = r.interests.map((i) => INTEREST_LABELS[i].toLowerCase());
  return [capitalize(monthName(r.month)), plural(r.days, "día", "días"), ...(interests.length ? [interests.join(", ")] : [])].join(", ");
}

function DetailSkeleton({ backHref }: { backHref: string }) {
  return (
    <main aria-busy="true" className="flex flex-1 flex-col">
      <p role="status" className="sr-only">
        Cargando el destino
      </p>
      <div className="relative h-[250px] bg-skeleton">
        <div className="absolute left-5 top-[calc(env(safe-area-inset-top)+20px)]">
          <BackButton href={backHref} />
        </div>
      </div>
      <div className="-mt-10 flex flex-col gap-3 px-5">
        <div className="tp-pulse h-[190px] rounded-[20px] bg-panel" />
        <div className="tp-pulse h-[300px] rounded-2xl bg-surface" />
      </div>
    </main>
  );
}

function CostSection({ flight, stay, total }: { flight: number | null; stay: number | null; total: number | null }) {
  const parts = [
    { label: "Vuelo", value: flight, color: "var(--c-fill)" },
    { label: "Alojamiento, comida y traslados", value: stay, color: "#46d4f2" },
  ];
  const sum = parts.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <section aria-labelledby="cost-title">
      <div className="flex items-baseline justify-between">
        <h2 id="cost-title" className="font-display text-[22px] font-extrabold">
          Estimación de viaje
        </h2>
        <span className="font-display text-[28px] font-extrabold">{formatUsd(total)}</span>
      </div>
      {sum > 0 ? (
        <div className="mt-3 flex h-3.5 gap-[3px] overflow-hidden rounded-[3px]" aria-hidden="true">
          {parts.map((p) =>
            p.value ? <div key={p.label} style={{ flex: p.value, background: p.color }} className="min-w-1" /> : null,
          )}
        </div>
      ) : null}
      <ul className="mt-2.5 flex flex-col gap-1 text-[13px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px] border border-fg" style={{ background: p.color }} />
            <span className="flex-1">{p.label}</span>
            <span className="font-semibold">{p.value != null ? formatUsd(p.value) : "Sin datos"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-mid">Importes de referencia del dataset interno; no consultamos tarifas de Amadeus en vivo. Verifica precios y disponibilidad antes de reservar.</p>
    </section>
  );
}

function Loaded({ data, request, q }: { data: DestinationDetailResponse; request: TripRequest; q?: string }) {
  const { card, reality, sources } = data;
  const { destination: d, result: r, verdict } = card;
  const limited = r.score == null;
  const usedSources = sources.filter((source) => r.factors.some((factor) => factor.sourceName.includes(source.name)));
  const qs = q ? `?q=${q}` : "";
  const backHref = `/resultados${qs}`;
  const [leaving, setLeaving] = useState<"flight" | "hotel" | null>(null);
  const [clickError, setClickError] = useState(false);
  const busy = useRef(false);

  const go = async (kind: "flight" | "hotel") => {
    if (busy.current) return;
    busy.current = true;
    setLeaving(kind);
    setClickError(false);
    // Se abre la pestaña dentro del gesto del usuario para que no la bloquee el navegador.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const { url } = await postClick({ destinationId: d.id, kind, requestId: loadRequestId() });
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      setClickError(true);
    } finally {
      busy.current = false;
      setLeaving(null);
    }
  };

  const compareWith = reality?.alternativeDestination.id;
  const available = r.factors.filter((f) => f.value != null);
  const unavailable = r.factors.filter((f) => f.value == null);

  return (
    <main className="flex flex-1 flex-col">
      <div className="relative -mb-10 h-[300px]">
        <div className="absolute inset-0">
          <DestinationPoster poster={d.poster} variant="header" />
          {limited ? <div className="absolute inset-0 bg-[rgba(232,237,241,.42)]" aria-hidden="true" /> : null}
        </div>
        <div className="relative flex items-start justify-between px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
          <BackButton href={backHref} />
          <SaveButton
            variant="circle"
            destinationId={d.id}
            name={d.name}
            country={d.country}
            score={r.score}
            totalUsd={r.cost.totalUsd}
            request={request}
            poster={d.poster}
          />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col gap-6 px-5 pb-6">
        <section className="panel rounded-[20px] bg-panel p-[18px] pb-4 text-panel-fg">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1
                className={`font-display text-[56px] font-extrabold leading-[0.85] tracking-[1px] ${limited ? "text-panel-mid" : "text-signal"}`}
              >
                {d.id}
              </h1>
              <p className="mt-2 text-[16px]">
                {d.name}, {d.country}
              </p>
              {!limited ? <p className="mt-0.5 text-[12px] text-panel-mid">{tripLine(request)}</p> : null}
            </div>
            <FlapScore value={r.score} size="lg" variant="panel" />
          </div>
          {limited ? (
            <>
              <p className="mt-3.5 inline-block rounded-full bg-stamp px-3 py-1.5 text-[13px] font-bold text-white">Información limitada</p>
              <p className="mt-2.5 text-[14px] leading-[1.5] text-[#dbe3ea]">
                No mostramos un puntaje porque con los datos disponibles sería poco confiable.
              </p>
            </>
          ) : (
            <div className="mt-3.5 border-t border-dashed border-[#34506f] pt-3">
              <p className="text-[14px] leading-[1.5] text-[#dbe3ea]">{verdict.text}</p>
              {verdict.warning ? (
                <p className="mt-2.5 flex gap-2 rounded-xl bg-tile-panel px-3 py-2 text-[13px] leading-[1.45]">
                  <Warning size={16} className="mt-0.5 shrink-0 text-signal" />
                  <span>{verdict.warning}</span>
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-panel-mid">
                {verdict.aiGenerated
                  ? "Veredicto redactado por IA. Los números vienen del motor de cálculo."
                  : "Resumen generado desde el desglose."}
              </p>
            </div>
          )}
        </section>

        {limited ? (
          <>
            <section className="rounded-2xl bg-surface p-4" aria-labelledby="conf-title">
              <div className="flex items-baseline justify-between">
                <h2 id="conf-title" className="font-display text-[18px] font-extrabold">
                  Confianza
                </h2>
                <span className="font-display text-[24px] font-extrabold text-alert">{Math.round(r.confidence)}%</span>
              </div>
              <ConfidenceBar value={r.confidence} band="limited" size="md" hideText className="mt-2.5" />
              <p className="mt-2.5 text-[13px] leading-[1.5] text-fg2">
                Bajo el umbral de 40%. Con menos del 40% no publicamos ranking numérico. {r.confidenceReason}
              </p>
            </section>
            <section className="rounded-2xl bg-surface p-4" aria-labelledby="missing-title">
              <h2 id="missing-title" className="font-display text-[18px] font-extrabold">
                Qué datos faltan
              </h2>
              <ul className="mt-2.5 flex flex-col gap-2.5 text-[14px]">
                {[...unavailable, ...available].map((f) => (
                  <li key={f.key} className="flex justify-between gap-3">
                    <span>{f.label}</span>
                    {(() => { const stale = r.missing.some((m) => m.startsWith(f.label) && m.includes("antiguo")); return <b className={f.value == null || stale ? "text-alert" : ""}>{f.value == null ? "Sin datos" : stale ? "Dato antiguo" : "Disponible"}</b>; })()}
                  </li>
                ))}
              </ul>
              
            </section>
          </>
        ) : (
          <>
            <section aria-labelledby="factors-title">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 id="factors-title" className="font-display text-[22px] font-extrabold">
                  Cómo se calcula el {r.score}
                </h2>
                <span className="text-[12px] text-mid">Factor, fuente y fecha</span>
              </div>
              <ul className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
                {r.factors.map((f) => (
                  <FactorRow key={f.key} factor={f} />
                ))}
              </ul>
              <p className="mt-2.5 px-1 text-[12px] leading-[1.5] text-mid">Los pesos son una estimación experimental.</p>
            </section>

            <section className="rounded-2xl bg-surface p-4" aria-labelledby="conf-title">
              <div className="flex items-baseline justify-between">
                <h2 id="conf-title" className="font-display text-[18px] font-extrabold">
                  Confianza del puntaje
                </h2>
                <span className="font-display text-[24px] font-extrabold">{Math.round(r.confidence)}%</span>
              </div>
              <ConfidenceBar value={r.confidence} band={r.confidenceBand} size="md" hideText className="mt-2.5" />
              <p className="mt-2.5 text-[13px] leading-[1.5] text-fg2">{r.confidenceReason}</p>
              {r.missing.length > 0 ? (
                <p className="mt-2 text-[13px] leading-[1.5] text-alert">Faltan o están vencidos: {r.missing.join(", ")}.</p>
              ) : null}
            </section>

            {reality ? (
              <RealityCheckTable
                chosenName={d.name}
                alternativeName={reality.alternativeDestination.name}
                rows={reality.rows}
                conclusion={reality.conclusionVerdict.text || reality.conclusion}
                note={reality.conclusionVerdict.warning}
              />
            ) : null}

            <CostSection flight={r.cost.flightUsd} stay={r.cost.stayUsd} total={r.cost.totalUsd} />

            <Button href={`/live?city=${encodeURIComponent(`${d.name}, ${d.country}`)}`} variant="outlineBold" size="md">
              Explorar {d.name} en el mapa
            </Button>

            {compareWith ? (
              <Button href={`/comparar?a=${d.id}&b=${compareWith}${q ? `&q=${q}` : ""}`} variant="outlineBold" size="md">
                Comparar con {reality?.alternativeDestination.name}
              </Button>
            ) : null}
          </>
        )}

        <details className="rounded-2xl bg-surface px-4 py-3 text-[13px]">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Fuentes asociadas a este resultado</summary>
          <ul className="mt-1 flex flex-col gap-2 pb-1">
            {usedSources.map((s) => (
              <li key={s.id} className="leading-[1.4]">
                <span className="font-semibold">{s.name}</span>
                <span className="text-mid"> · {s.license}</span>
                {s.url ? (
                  <>
                    {" "}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Ver fuente: ${s.name}`}
                      className="inline-flex min-h-11 items-center px-1 underline"
                    >
                      Ver fuente
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {limited ? (
        <AffiliateBar>
          <Button href={backHref} className="w-full">
            Ver destinos con datos completos
          </Button>
        </AffiliateBar>
      ) : (
        <AffiliateBar
          note={
            clickError ? (
              <span role="alert" className="font-semibold text-alert">
                No pudimos abrir el enlace. Inténtalo de nuevo.
              </span>
            ) : (
              "Enlaces de afiliado: podemos recibir una comisión sin costo extra para ti. Registramos el clic."
            )
          }
        >
          <Button onClick={() => go("flight")} disabled={leaving !== null} className="flex-[3]">
            {leaving === "flight" ? "Abriendo…" : "Ver vuelos"}
          </Button>
          <Button onClick={() => go("hotel")} disabled={leaving !== null} variant="outlineBold" className="flex-[2]">
            {leaving === "hotel" ? "Abriendo…" : "Ver hoteles"}
          </Button>
        </AffiliateBar>
      )}
    </main>
  );
}

export function DestinationView({ id, q }: { id: string; q?: string }) {
  const request = parseRequest(q);
  const res = useAsync<DestinationDetailResponse>((signal) => getDestination(id, q, signal), `${id}|${q ?? ""}`);
  const backHref = `/resultados${q ? `?q=${q}` : ""}`;

  if (res.status === "loading" && !res.data) return <DetailSkeleton backHref={backHref} />;

  if (res.status === "error") {
    const notFound = res.error instanceof ApiError && (res.error.status === 404 || res.error.status === 400);
    return notFound ? (
      <main className="flex flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+20px)]">
        <BackButton href={backHref} />
        <h1 className="cond mt-6 font-display text-[36px] font-extrabold leading-[0.98]">No encontramos ese destino.</h1>
        <p className="mt-3 text-[15px] text-fg2">Puede que el enlace esté mal escrito o que el destino ya no esté disponible.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
          Volver al inicio
        </Link>
      </main>
    ) : (
      <main className="flex flex-1 flex-col">
        <div className="px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-4">
          <BackButton href={backHref} />
        </div>
        <ErrorPanel error={res.error} onRetry={res.retry} />
      </main>
    );
  }

  return <Loaded data={res.data as DestinationDetailResponse} request={request} q={q} />;
}
