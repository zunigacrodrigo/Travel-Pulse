"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getRecommendations } from "@/lib/client/api";
import { cacheResults, loadCachedResults, storeRequestId } from "@/lib/client/cache";
import { describeRequest, formatDayMonth, formatUpdated, formatUsd, joinList } from "@/lib/client/format";
import { useAsync } from "@/lib/client/hooks";
import { decodeRequest, encodeRequest, parseRequest } from "@/lib/client/query";
import type { DestinationCard, RecommendationsResponse, TripRequest } from "@/lib/types";
import { BoardingPassRow } from "../BoardingPassRow";
import { ConfidenceBar } from "../ConfidenceBar";
import { DestinationPoster } from "../DestinationPoster";
import { FlapScore } from "../FlapScore";
import { SaveButton } from "../SaveButton";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "../StatePanels";
import { PageHeader } from "../ui/PageHeader";

function limitedText(card: DestinationCard): string {
  const missing = card.result.missing.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
  return missing.length > 0 ? `Faltan datos: ${joinList(missing.slice(0, 3))}.` : card.result.reason;
}

function Hero({ card, q, request, next, computedAt }: { card: DestinationCard; q: string; request: TripRequest; next?: DestinationCard; computedAt: string }) {
  const { destination: d, result: r } = card;
  return (
    <section aria-labelledby="hero-title">
      <Link
        href={`/destino/${d.id}?q=${q}`}
        className="panel block overflow-hidden rounded-[20px] bg-panel text-panel-fg"
      >
        <div className="relative h-[180px]">
          <DestinationPoster poster={d.poster} variant="hero" />
          <div className="absolute left-3.5 top-3.5 flex flex-col items-start gap-1.5">
            <span className="rounded-full bg-signal px-3 py-[5px] text-[12px] font-bold text-ink">Mejor opción</span>
            {r.opportunity ? (
              <span className="rounded-full bg-ink px-3 py-[5px] text-[12px] font-bold text-signal">Señal de oportunidad</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pt-2.5">
          <div className="min-w-0">
            <h2 id="hero-title" className="font-display text-[44px] font-extrabold leading-[0.9] tracking-[1px] text-signal">
              {d.id}
            </h2>
            <p className="mt-1.5 text-[15px]">
              {d.name}, {d.country}
            </p>
            <p className="mt-0.5 text-[13px] text-panel-fg2">{formatUsd(r.cost.totalUsd)} en total</p>
          </div>
          <FlapScore value={r.score} size="md" variant="panel" />
        </div>
        <div className="px-4 pb-4 pt-2.5">
          <ConfidenceBar value={r.confidence} band={r.confidenceBand} tone="panel" label="Confianza" />
        </div>
      </Link>

      <div className="mt-3 flex flex-col gap-3">
        <p className="px-1 text-[14px] leading-[1.45] text-fg2">
          {r.reason}
          <span className="mt-0.5 block text-[12px] text-mid">Cálculo generado {formatUpdated(computedAt)} · precios de referencia, no cotizaciones en vivo</span>
          {r.opportunity ? <span className="mt-1 block text-[12px] text-mid">Indicador de destino: combina precio de vuelo bajo su referencia y menor saturación estacional. No mide el pulso actual de una ciudad.</span> : null}
        </p>
        <div className="flex gap-2.5">
          <SaveButton
            destinationId={d.id}
            name={d.name}
            country={d.country}
            score={r.score}
            totalUsd={r.cost.totalUsd}
            request={request}
            poster={d.poster}
          />
          {next ? (
            <Link
              href={`/comparar?a=${d.id}&b=${next.destination.id}&q=${q}`}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border-2 border-outline px-2 text-center text-[14px] font-semibold"
            >
              Comparar con {next.destination.name}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Results({ data, q, banner }: { data: RecommendationsResponse; q: string; banner?: string }) {
  const request = data.request;
  const [first, ...rest] = data.top;
  const hasHero = first && first.result.score != null;
  const others = hasHero ? rest : data.top;
  const next = rest.find((c) => c.result.score != null) ?? rest[0];

  return (
    <div className="flex flex-1 flex-col gap-3 px-5 pb-8" aria-live="polite">
      {banner ? (
        <p className="rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-fg2">
          <b className="font-semibold text-fg">Resultados anteriores.</b> {banner}
        </p>
      ) : null}
      {hasHero ? <Hero card={first} q={q} request={request} next={next} computedAt={data.computedAt} /> : null}
      {others.length > 0 ? (
        <section aria-labelledby="others-title" className="mt-2 flex flex-col gap-2.5">
          <h2 id="others-title" className="font-display text-[20px] font-extrabold">
            {hasHero ? "Otras opciones" : "Opciones"}
          </h2>
          <ul className="flex flex-col gap-2.5">
            {others.map((c) => {
              const { destination: d, result: r } = c;
              const limited = r.score == null;
              return (
                <li key={d.id}>
                  <BoardingPassRow
                    href={`/destino/${d.id}?q=${q}`}
                    code={d.id}
                    name={d.name}
                    poster={d.poster}
                    score={r.score}
                    confidence={{ value: r.confidence, band: r.confidenceBand }}
                    body={
                      limited ? (
                        limitedText(c)
                      ) : (
                        <>
                          {r.cost.totalUsd != null ? <b className="font-semibold text-fg">{formatUsd(r.cost.totalUsd)}. </b> : null}
                          {r.reason}
                        </>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function ResultsView({ q }: { q?: string }) {
  const request = useMemo(() => parseRequest(q), [q]);
  const encoded = q && q.length > 0 ? q : encodeRequest(request);
  const res = useAsync<RecommendationsResponse>((signal) => getRecommendations(request, signal), encoded);
  const [showCached, setShowCached] = useState(false);
  const [cached, setCached] = useState<RecommendationsResponse | null>(null);

  useEffect(() => {
    if (res.status === "success") {
      storeRequestId(res.data.requestId);
      if (res.data.top.length > 0) cacheResults(res.data);
    }
  }, [res.status, res.data]);

  useEffect(() => {
    if (res.status === "error") setCached(loadCachedResults());
    else setShowCached(false);
  }, [res.status]);

  const subtitle = describeRequest(request);
  const garbage = !!q && decodeRequest(q) === null;
  const notice = garbage ? (
    <p role="status" className="mx-5 mb-3 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] leading-[1.45] text-fg2">
      No pudimos leer tu búsqueda; te mostramos una búsqueda de ejemplo.{" "}
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-fg underline">
        Editar mi búsqueda
      </Link>
    </p>
  ) : null;
  const backHref = `/?q=${encoded}`;

  if (res.status === "loading" && !res.data) {
    return (
      <>
        <PageHeader backHref={backHref} title="Calculando tu Top 5" subtitle={subtitle} />
        {notice}
        <LoadingPanel />
      </>
    );
  }

  if (res.status === "error") {
    if (showCached && cached) {
      const cachedQ = encodeRequest(cached.request);
      return (
        <>
          <PageHeader backHref={backHref} title="Tus 5 mejores opciones" subtitle={describeRequest(cached.request)} />
          <Results
            data={cached}
            q={cachedQ}
            banner={`Calculados el ${formatDayMonth(cached.computedAt)}. Los precios pueden haber cambiado.`}
          />
        </>
      );
    }
    return (
      <>
        <PageHeader backHref={backHref} title="Tus 5 mejores opciones" subtitle={subtitle} />
        {notice}
        <ErrorPanel
          error={res.error}
          onRetry={res.retry}
          cachedLabel={cached ? `Ver resultados del ${formatDayMonth(cached.computedAt)}` : null}
          onShowCached={() => setShowCached(true)}
        />
      </>
    );
  }

  const data = res.data as RecommendationsResponse;
  if (data.top.length === 0) {
    return (
      <>
        <PageHeader backHref={backHref} title="Sin resultados" subtitle={subtitle} />
        {notice}
        <EmptyPanel request={data.request} help={data.emptyHelp} />
      </>
    );
  }

  return (
    <>
      <PageHeader backHref={backHref} title="Tus 5 mejores opciones" subtitle={subtitle} />
      {notice}
      <Results data={data} q={encodeRequest(data.request)} />
    </>
  );
}
