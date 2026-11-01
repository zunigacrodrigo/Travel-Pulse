"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCloud } from "@/lib/cloud/client";
import {
  CATEGORIES, CATEGORY_LABELS, KINDS, PILOT_CITIES, TTL_HOURS, kindLabel, pilotCity, reportInputSchema, stateText, toInsertRow, validity,
  type Category, type PublicSignal,
} from "@/lib/pulsemesh/model";
import { PulseError, supabasePulseStore, type FlagReason } from "@/lib/pulsemesh/store";
import { Button } from "./ui/Button";

const STATE_STYLE: Record<PublicSignal["state"], string> = {
  corroborada: "bg-[#46d4f2]/15 text-[#46d4f2]",
  por_confirmar: "bg-[#f0a53a]/15 text-[#f0a53a]",
  en_disputa: "bg-[#ff8a78]/15 text-[#ff8a78]",
};
const STATE_LABEL: Record<PublicSignal["state"], string> = { corroborada: "Corroborada", por_confirmar: "Por confirmar", en_disputa: "En disputa" };
const REASONS: ReadonlyArray<[FlagReason, string]> = [["falso", "Es falso"], ["spam", "Es spam"], ["ofensivo", "Es ofensivo"], ["privacidad", "Expone datos personales"], ["otro", "Otro motivo"]];

const field = "min-h-11 w-full rounded-xl border border-line bg-page px-3 text-[14px]";

/** Reporta si el navegador entrega una posición; se redondea a ~1 km antes de enviarla y no se guarda en el dispositivo. */
function approxPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function PulseMeshPanel({ cityName, country }: { cityName: string; country: string }) {
  const cloud = getCloud();
  const city = pilotCity(`${cityName}, ${country}`);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [signals, setSignals] = useState<PublicSignal[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("afluencia");
  const [kind, setKind] = useState<string>(KINDS.afluencia[0]!.kind);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [price, setPrice] = useState("");
  const [withLocation, setWithLocation] = useState(false);

  const cityKey = city?.key ?? null;

  const refresh = useCallback(async () => {
    if (!cloud || !cityKey) return;
    try {
      setSignals(await supabasePulseStore(cloud).list(cityKey));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [cloud, cityKey]);

  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void cloud.auth.getSession().then(({ data }) => active && setSession(data.session));
    const { data } = cloud.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [cloud]);

  // Carga inicial: el estado se actualiza solo cuando llega la respuesta, no de forma síncrona en el efecto.
  useEffect(() => {
    if (!cloud || !cityKey) return;
    let active = true;
    void supabasePulseStore(cloud)
      .list(cityKey)
      .then((rows) => {
        if (!active) return;
        setSignals(rows);
        setLoadError(false);
      })
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [cloud, cityKey]);

  async function act(fn: () => Promise<void>, okText: string) {
    setBusy(true);
    try {
      await fn();
      setNotice({ kind: "ok", text: okText });
      await refresh();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof PulseError ? e.message : "No se pudo completar la acción. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!cloud || !city || !session) return;
    const pos = withLocation ? await approxPosition() : null;
    if (withLocation && !pos) setNotice({ kind: "error", text: "No pudimos obtener tu ubicación; el reporte se enviará sin ella." });
    const parsed = reportInputSchema.safeParse({
      category, kind, title, detail: detail || undefined,
      ...(category === "precios" ? { priceAmount: price === "" ? undefined : Number(price.replace(",", ".")), priceCurrency: city.currency } : {}),
      ...(pos ? { lat: pos.lat, lon: pos.lon } : {}),
    });
    if (!parsed.success) {
      setNotice({ kind: "error", text: parsed.error.issues[0]?.message ?? "Revisa los datos del reporte." });
      return;
    }
    await act(async () => {
      await supabasePulseStore(cloud).create(toInsertRow(parsed.data, session.user.id, city.key));
      setTitle(""); setDetail(""); setPrice(""); setWithLocation(false); setOpen(false); // la ubicación se decide en cada reporte, nunca queda activada
    }, "Reporte enviado. Aparecerá como «por confirmar» hasta que otras personas lo corroboren.");
  }

  if (!cloud) {
    return (
      <p role="status" className="rounded-2xl border border-line bg-surface p-4 text-sm leading-[1.5] text-fg2">
        Los reportes compartidos entre viajeros necesitan cuentas, que no están activadas en este servidor. Mientras tanto, las notas se guardan solo en este dispositivo.
      </p>
    );
  }
  if (!city) {
    return (
      <p role="status" className="rounded-2xl border border-line bg-surface p-4 text-sm leading-[1.5] text-fg2">
        Los reportes de viajeros están en piloto en {PILOT_CITIES.map((c) => c.name).join(", ")}. Todavía no están abiertos en {cityName}.
      </p>
    );
  }

  const now = new Date();
  return (
    <section aria-labelledby="pm-title" className="flex flex-col gap-3">
      <div>
        <h3 id="pm-title" className="font-display text-base font-extrabold text-fg">Reportes de viajeros en {city.name}</h3>
        <p className="text-xs leading-[1.5] text-mid">Observaciones de personas, no información oficial. Caducan solas. Tu ubicación nunca se comparte con precisión.</p>
      </div>

      {session === null ? (
        <p className="rounded-xl border border-line bg-surface p-3 text-[13px] text-fg2">
          Para reportar o confirmar necesitas una cuenta (solo tu correo). <Link href="/cuenta" className="font-semibold underline underline-offset-2">Iniciar sesión</Link>
        </p>
      ) : session ? (
        <div>
          {!open ? (
            <Button size="sm" onClick={() => setOpen(true)}>Reportar algo</Button>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
            >
              <label className="text-[13px] font-semibold" htmlFor="pm-cat">Categoría</label>
              <select id="pm-cat" className={field} value={category} onChange={(e) => { const c = e.target.value as Category; setCategory(c); setKind(KINDS[c][0]!.kind); }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <label className="text-[13px] font-semibold" htmlFor="pm-kind">Qué observaste</label>
              <select id="pm-kind" className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS[category].map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              <label className="text-[13px] font-semibold" htmlFor="pm-title-in">Título breve</label>
              <input id="pm-title-in" className={field} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Fila de 40 minutos en el ascensor" />
              {category === "precios" ? (
                <>
                  <label className="text-[13px] font-semibold" htmlFor="pm-price">Precio observado ({city.currency})</label>
                  <input id="pm-price" className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ej.: 7500" />
                </>
              ) : null}
              <label className="text-[13px] font-semibold" htmlFor="pm-detail">Detalle (opcional)</label>
              <textarea id="pm-detail" className="min-h-20 w-full rounded-xl border border-line bg-page p-3 text-[14px]" maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
              <label className="flex items-start gap-2 text-[13px] text-fg2">
                <input type="checkbox" className="mt-1" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} />
                <span>Incluir mi ubicación aproximada (~1 km). Es opcional y solo se toma ahora, al enviar.</span>
              </label>
              <p className="text-[12px] text-mid">Este reporte vencerá en {TTL_HOURS[category] < 48 ? `${TTL_HOURS[category]} h` : `${Math.round(TTL_HOURS[category] / 24)} días`} y no podrás editarlo; sí borrarlo.</p>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={busy}>{busy ? "Enviando…" : "Enviar reporte"}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {notice ? <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-xl border border-line bg-surface p-3 text-[13px] ${notice.kind === "error" ? "text-alert" : "text-fg2"}`}>{notice.text}</p> : null}

      {loadError ? (
        <p role="alert" className="rounded-xl border border-line bg-surface p-3 text-[13px] text-alert">No pudimos cargar los reportes. <button className="font-semibold underline" onClick={() => void refresh()}>Reintentar</button></p>
      ) : signals === null ? (
        <div aria-busy="true" className="tp-pulse h-20 rounded-2xl bg-surface" />
      ) : signals.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-fg2">Todavía no hay reportes de viajeros en {city.name}. {session ? "Sé la primera persona en reportar algo." : "Inicia sesión para ser la primera persona."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {signals.map((s) => (
            <li key={s.id} className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_STYLE[s.state]}`}>{STATE_LABEL[s.state]}</span>
                <span className="text-[11px] text-mid">{CATEGORY_LABELS[s.category]} · {kindLabel(s.category, s.kind)} · {validity(s.expiresAt, now)}</span>
              </div>
              <h4 className="mt-1 font-display text-[15px] font-extrabold leading-tight text-fg">{s.title}</h4>
              {s.priceAmount !== null ? <p className="text-[13px] font-semibold text-fg">{s.priceCurrency} {s.priceAmount.toLocaleString("es-CL")} <span className="font-normal text-mid">(observado por un viajero)</span></p> : null}
              {s.detail ? <p className="mt-1 text-[13px] text-fg2">{s.detail}</p> : null}
              <p className="mt-1 text-[12px] text-mid">{stateText(s)}</p>
              {session ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {s.isMine ? (
                    <>
                      <span className="text-[12px] text-mid">Tu reporte</span>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabasePulseStore(cloud).remove(s.id), "Reporte borrado.")}>Borrar</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabasePulseStore(cloud).respond(s.id, session.user.id, "confirma"), "Gracias, registramos tu confirmación.")}>Lo confirmo</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabasePulseStore(cloud).respond(s.id, session.user.id, "contradice"), "Gracias, registramos que no coincide.")}>No es así</Button>
                      <details className="text-[12px] text-mid">
                        <summary className="cursor-pointer select-none">Marcar</summary>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {REASONS.map(([r, label]) => (
                            <button key={r} type="button" disabled={busy} className="rounded-full border border-line px-2 py-1" onClick={() => void act(() => supabasePulseStore(cloud).flag(s.id, session.user.id, r), "Gracias, lo revisaremos.")}>{label}</button>
                          ))}
                        </div>
                      </details>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
