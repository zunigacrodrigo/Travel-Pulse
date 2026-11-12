"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCloud } from "@/lib/cloud/client";
import { browserLocalStore } from "@/lib/cloud/local-store";
import { supabaseStore } from "@/lib/cloud/supabase-store";
import { syncAll, type SyncReport } from "@/lib/cloud/sync";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function describe(r: SyncReport): string {
  const parts = [
    r.dna === "push" ? "Travel DNA subido" : r.dna === "pull" ? "Travel DNA recuperado" : "Travel DNA al día",
    r.savedPushed || r.savedPulled ? `guardados: ${r.savedPushed} subidos, ${r.savedPulled} recuperados` : "guardados al día",
    r.trip === "push" ? "viaje subido" : r.trip === "pull" ? "viaje recuperado" : "viaje al día",
  ];
  return parts.join(" · ");
}

export function AccountView() {
  const cloud = getCloud();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const autoSynced = useRef<string | null>(null);

  const sync = useCallback(
    async (s: Session) => {
      if (!cloud) return;
      setBusy(true);
      try {
        const report = await syncAll(supabaseStore(cloud), browserLocalStore, s.user.id);
        if (report.errors.length) setStatus({ kind: "error", text: `Sincronización parcial. ${report.errors.join(" · ")}` });
        else setStatus({ kind: "ok", text: describe(report) });
      } catch (e) {
        setStatus({ kind: "error", text: e instanceof Error ? e.message : "No se pudo sincronizar." });
      } finally {
        setBusy(false);
      }
    },
    [cloud],
  );

  useEffect(() => {
    if (!cloud) return;
    let active = true;
    void cloud.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = cloud.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [cloud]);

  // Una sola sincronización automática por sesión iniciada.
  useEffect(() => {
    if (session && autoSynced.current !== session.user.id) {
      autoSynced.current = session.user.id;
      void sync(session);
    }
  }, [session, sync]);

  async function sendLink() {
    if (!cloud) return;
    if (!EMAIL_RE.test(email.trim())) {
      setStatus({ kind: "error", text: "Escribe un correo válido." });
      return;
    }
    setBusy(true);
    const { error } = await cloud.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/cuenta`, shouldCreateUser: true },
    });
    setBusy(false);
    setStatus(
      error
        ? { kind: "error", text: "No se pudo enviar el enlace. Inténtalo de nuevo en unos minutos." }
        : { kind: "info", text: "Te enviamos un enlace de acceso. Ábrelo desde este mismo dispositivo." },
    );
  }

  async function deleteCloudData() {
    if (!cloud) return;
    setBusy(true);
    try {
      await supabaseStore(cloud).deleteAllMine();
      setStatus({ kind: "ok", text: "Borramos tus datos de la nube. Lo que hay en este dispositivo se conserva." });
    } catch {
      setStatus({ kind: "error", text: "No se pudieron borrar tus datos. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pb-8">
      <PageHeader backHref="/perfil" title="Mi cuenta" subtitle="Opcional: respalda tus datos y úsalos en otro dispositivo" />
      <div className="flex flex-col gap-4 px-5">
        {!cloud ? (
          <p role="status" className="rounded-2xl border border-line bg-surface p-4 text-[14px] leading-[1.5] text-fg2">
            Las cuentas no están activadas en este servidor. Todo lo que guardas se queda en este dispositivo y la app funciona igual.
          </p>
        ) : session === undefined ? (
          <div aria-busy="true" className="tp-pulse h-32 rounded-2xl bg-surface" />
        ) : session === null ? (
          <form
            noValidate
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendLink();
            }}
          >
            <label htmlFor="acct-email" className="text-[14px] font-semibold">
              Tu correo
            </label>
            <input
              id="acct-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="min-h-12 rounded-xl border border-line bg-page px-3 text-[15px]"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Enviarme un enlace de acceso"}
            </Button>
            <p className="text-[12px] leading-[1.5] text-mid">Sin contraseña. Solo usamos tu correo para iniciar sesión.</p>
          </form>
        ) : (
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" aria-label="Sesión iniciada">
            <p className="text-[14px]">
              Sesión iniciada como <b>{session.user.email}</b>
            </p>
            <Button disabled={busy} onClick={() => void sync(session)}>
              {busy ? "Sincronizando…" : "Sincronizar ahora"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void cloud.auth.signOut()}>
              Cerrar sesión
            </Button>
            {!confirmDelete ? (
              <Button variant="link" onClick={() => setConfirmDelete(true)}>
                Borrar mis datos en la nube
              </Button>
            ) : (
              <div role="alertdialog" aria-label="Confirmar borrado" className="rounded-xl border border-line p-3">
                <p className="text-[13px] font-semibold">¿Borrar tu Travel DNA, guardados y viaje de la nube? No se puede deshacer. Lo de este dispositivo se conserva.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void deleteCloudData()}>
                    Sí, borrar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
        {status ? (
          <p role={status.kind === "error" ? "alert" : "status"} className={`rounded-xl border border-line bg-surface p-3 text-[13px] ${status.kind === "error" ? "text-alert" : "text-fg2"}`}>
            {status.text}
          </p>
        ) : null}
        <section aria-labelledby="acct-what" className="text-[13px] leading-[1.6] text-fg2">
          <h2 id="acct-what" className="mb-1 font-display text-[16px] font-extrabold text-fg">
            Qué se guarda y qué no
          </h2>
          <ul className="list-disc pl-5">
            <li>Se guardan solo tus preferencias de Travel DNA, tus destinos guardados y tu viaje activo con su historial.</li>
            <li>Solo tú puedes leerlos: cada fila está protegida por tu cuenta.</li>
            <li>Los destinos guardados de una ciudad explorada fuera del catálogo se quedan en este dispositivo.</li>
            <li>Borrar tus datos en la nube no elimina tu inicio de sesión.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
