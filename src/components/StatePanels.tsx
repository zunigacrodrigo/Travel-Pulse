"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EmptyHelp, TripRequest } from "@/lib/types";
import { formatUsd, monthName, originName, plural } from "@/lib/client/format";
import { ApiError } from "@/lib/client/api";
import { usePrefersReducedMotion } from "@/lib/client/hooks";
import { encodeRequest } from "@/lib/client/query";
import { FlapTile } from "./FlapScore";
import { Button } from "./ui/Button";
import { Refresh, WifiOff, Warning } from "./ui/Icons";

/* ------------------------------------------------------------------ */
/* Cargando: tablero de salidas                                         */
/* ------------------------------------------------------------------ */

const BOARD_CODES = ["CUZ", "SLA", "OAX", "MDE", "FLN", "LIM", "BOG", "MVD"];

const STEPS = [
  { title: "Costos de viaje", sub: "Estimaciones de referencia · no son cotizaciones" },
  { title: "Clima del mes", sub: "Referencia climática estacional" },
  { title: "Saturación turística", sub: "Datos agregados de referencia" },
  { title: "Tendencia de búsqueda", sub: "Indicador de referencia" },
];

function SkeletonRow({ dim = false }: { dim?: boolean }) {
  return (
    <div className={`flex h-[84px] overflow-hidden rounded-2xl bg-surface ${dim ? "opacity-60" : ""}`}>
      <div className="w-[84px] bg-skeleton" />
      <div className="flex flex-1 flex-col gap-2 px-3.5 py-4">
        <div className="h-3.5 w-[56%] rounded bg-skeleton" />
        <div className="h-2.5 w-[84%] rounded bg-skeleton2" />
        <div className="h-2.5 w-[70%] rounded bg-skeleton2" />
      </div>
      <div className="flex items-center gap-[3px] pr-3.5">
        <span className="h-[38px] w-[26px] rounded-[5px] bg-skeleton" />
        <span className="h-[38px] w-[26px] rounded-[5px] bg-skeleton" />
      </div>
    </div>
  );
}

export function LoadingPanel() {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1500);
    return () => window.clearInterval(id);
  }, [reduced]);

  const code = BOARD_CODES[tick % BOARD_CODES.length].split("");
  const active = reduced ? 0 : tick % STEPS.length;

  return (
    <div className="flex flex-1 flex-col gap-3 px-5 pb-8" aria-busy="true">
      <p role="status" className="sr-only">
        Calculando tu Top 5 con los datos de referencia disponibles.
      </p>
      <section aria-hidden="true" className="panel rounded-[20px] bg-panel px-[18px] py-5 text-panel-fg">
        <div className="text-[13px] text-panel-mid">Comparando destinos · valores de referencia, no cotizaciones en vivo</div>
        <div className="mt-3.5 flex gap-1.5">
          {code.map((c, i) => (
            <FlapTile key={i} char={c} size="lg" variant="panel" flip={!reduced} />
          ))}
          <span className="flex-1" />
          <FlapTile char="–" size="lg" variant="panel" color="#4a6585" />
          <FlapTile char="–" size="lg" variant="panel" color="#4a6585" />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-[2px] bg-track-panel">
          <div className="tp-indeterminate h-full w-[40%] rounded-[2px] bg-signal" />
        </div>
        <div className="mt-2 text-[12px] text-panel-fg2">Esto toma unos segundos</div>
      </section>

      <section aria-label="Fuentes que estamos consultando" className="rounded-[18px] bg-surface px-4 py-2.5">
        <ul>
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <li key={s.title} className="flex min-h-10 items-center gap-3 py-1">
                {on ? (
                  <span className="tp-spin size-[22px] shrink-0 rounded-full border-[3px] border-signal border-r-ink dark:border-r-panel-fg" />
                ) : (
                  <span className="size-[22px] shrink-0 rounded-full border-2 border-dashed border-mid" />
                )}
                <div className="flex-1">
                  <div className={`text-[15px] ${on ? "font-semibold" : "font-medium text-mid"}`}>{s.title}</div>
                  <div className="text-[12px] text-mid">{s.sub}</div>
                </div>
                <span className={`text-[12px] font-semibold ${on ? "" : "text-mid"}`}>{on ? "Consultando" : "En cola"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div aria-hidden="true" className="flex flex-col gap-2.5">
        <SkeletonRow />
        <SkeletonRow dim />
      </div>

      <p className="mt-auto pt-4 text-center text-[13px] leading-[1.5] text-mid">
        Si un dato no llega a tiempo, lo marcamos como faltante
        <br />y bajamos la confianza del destino.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error                                                                */
/* ------------------------------------------------------------------ */

interface ErrorPanelProps {
  /** Error original (ApiError u otro). */
  error?: unknown;
  /** Código a mostrar si no hay `error`. */
  code?: string;
  onRetry: () => void;
  /** Resultados guardados de una búsqueda anterior. */
  cachedLabel?: string | null;
  onShowCached?: () => void;
}

export function ErrorPanel({ error, code: codeProp, onRetry, cachedLabel, onShowCached }: ErrorPanelProps) {
  const api = error instanceof ApiError ? error : null;
  const code = api?.code ?? codeProp ?? "ERROR_DESCONOCIDO";
  const rateLimited = api?.status === 429;
  const offline = code === "SIN_CONEXION";
  const letters = rateLimited
    ? ["E", "S", "P", "E", "R", "A"]
    : offline
      ? ["S", "I", "N", " ", "R", "E", "D"]
      : ["F", "A", "L", "L", "A"];
  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 pb-7" role="alert">
      <section className="panel overflow-hidden rounded-[20px] bg-panel text-panel-fg">
        <div className="flex items-center gap-2.5 bg-stamp px-[18px] py-3 font-display text-[16px] font-extrabold text-white">
          {offline ? <WifiOff size={20} /> : <Warning size={20} />}
          {rateLimited ? "Demasiadas consultas" : offline ? "Sin conexión" : "Servicio no disponible"}
        </div>
        <div className="p-[18px]">
          <div className="flex gap-1.5" aria-hidden="true">
            {letters.map((c, i) =>
              c === " " ? <span key={i} className="w-3.5" /> : <FlapTile key={i} char={c} size="lg" variant="panel" color="#FF8A78" />,
            )}
          </div>
          {rateLimited ? (
            <>
              <h2 className="cond mt-[18px] font-display text-[34px] font-extrabold leading-none tracking-[-0.5px]">
                Hiciste muchas consultas seguidas.
              </h2>
              <p className="mt-2.5 text-[15px] leading-[1.5] text-panel-fg2">Vuelve a intentarlo en unos minutos.</p>
            </>
          ) : (
            <>
              <h2 className="cond mt-[18px] font-display text-[34px] font-extrabold leading-none tracking-[-0.5px]">
                No pudimos traer los precios de hoy.
              </h2>
              <p className="mt-2.5 text-[15px] leading-[1.5] text-panel-fg2">
                {offline
                  ? "Se cortó la conexión mientras consultábamos vuelos y hoteles. Tu búsqueda quedó guardada: no tienes que llenarla de nuevo."
                  : "Algo falló de nuestro lado mientras consultábamos vuelos y hoteles. Puedes reintentar sin llenar la búsqueda de nuevo."}
              </p>
            </>
          )}
        </div>
      </section>

      {cachedLabel && onShowCached ? (
        <section className="rounded-2xl bg-surface p-4">
          <h2 className="font-display text-[17px] font-extrabold">Mientras tanto</h2>
          <p className="mt-1.5 text-[14px] leading-[1.5] text-fg2">
            Puedes ver el Top 5 calculado antes. Los precios pueden haber cambiado, así que lo mostramos con la fecha.
          </p>
          <Button variant="outline" size="md" className="mt-3 w-full" onClick={onShowCached}>
            {cachedLabel}
          </Button>
        </section>
      ) : null}

      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        <Button onClick={onRetry}>
          <Refresh size={18} />
          Reintentar
        </Button>
        {rateLimited ? null : (
          <p className="mt-1.5 text-center text-[12px] text-mid">Código del error: {code}. Si se repite, avísanos.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sin resultados                                                       */
/* ------------------------------------------------------------------ */

export function EmptyPanel({ request, help }: { request: TripRequest; help: EmptyHelp | null }) {
  const cheapest = help?.cheapest ?? null;
  const suggestions = help?.suggestions ?? [];
  const title = cheapest
    ? `Con ${formatUsd(request.budgetUsd)} no alcanza para ${plural(request.days, "día", "días")} desde ${originName(request.origin)}.`
    : "No encontramos destinos para esta búsqueda.";
  return (
    <div className="flex flex-1 flex-col px-5 pb-7">
      <div className="mt-2" aria-hidden="true">
        <div className="flex gap-1.5">
          <FlapTile char="0" size="xl" />
          <FlapTile char="0" size="xl" />
        </div>
      </div>
      <h2 className="cond mt-4 font-display text-[36px] font-extrabold leading-[0.98] tracking-[-0.6px]">{title}</h2>
      <p className="mt-3 text-[15px] leading-[1.5] text-fg2">
        {cheapest
          ? `El destino más barato de ${monthName(request.month)}, ${(cheapest as { name?: string }).name ?? cheapest.destinationId}, sale ${formatUsd(cheapest.totalUsd)} con vuelo y alojamiento. Prueba uno de estos ajustes:`
          : suggestions.length > 0
            ? "Prueba uno de estos ajustes:"
            : "Cambia el mes, el presupuesto o los intereses e inténtalo de nuevo."}
      </p>

      {suggestions.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2.5">
          {suggestions.map((s, i) => {
            const primary = i === 0;
            return (
              <li key={`${s.kind}-${i}`}>
                <Link
                  href={`/resultados?q=${encodeRequest(s.request)}`}
                  className={`flex min-h-16 items-center gap-3 rounded-[14px] px-3.5 py-2.5 ${
                    primary ? "panel bg-panel text-panel-fg" : "bg-surface"
                  }`}
                >
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold">{s.label}</span>
                  </span>
                  <span
                    className={`rounded-lg px-2.5 py-1.5 font-display text-[15px] font-extrabold ${
                      primary ? "bg-signal text-ink" : "bg-page"
                    }`}
                  >
                    {plural(s.resultCount, "destino", "destinos")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-auto pt-8">
        <Button variant="outline" size="md" href={`/?q=${encodeRequest(request)}`} className="w-full">
          Cambiar la búsqueda a mano
        </Button>
      </div>
    </div>
  );
}
