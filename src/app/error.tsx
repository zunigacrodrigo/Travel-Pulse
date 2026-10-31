"use client";

import { useEffect } from "react";
import { FlapTile } from "@/components/FlapScore";
import { Button } from "@/components/ui/Button";
import { Refresh, Warning } from "@/components/ui/Icons";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+48px)]" role="alert">
      <div className="panel overflow-hidden rounded-[20px] bg-panel text-panel-fg">
        <div className="flex items-center gap-2.5 bg-stamp px-[18px] py-3 font-display text-[16px] font-extrabold text-white">
          <Warning size={20} />
          Algo falló
        </div>
        <div className="p-[18px]">
          <div className="flex gap-1.5" aria-hidden="true">
            {["F", "A", "L", "L", "A"].map((c, i) => (
              <FlapTile key={i} char={c} size="lg" variant="panel" color="#FF8A78" />
            ))}
          </div>
          <h1 className="cond mt-[18px] font-display text-[34px] font-extrabold leading-none tracking-[-0.5px]">
            Se nos trabó el tablero.
          </h1>
          <p className="mt-2.5 text-[15px] leading-[1.5] text-panel-fg2">
            Ocurrió un problema inesperado. Tu búsqueda sigue en la dirección de la página: puedes reintentar sin llenarla de nuevo.
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-1.5 pt-8">
        <Button onClick={reset}>
          <Refresh size={18} />
          Reintentar
        </Button>
        {error.digest ? <p className="mt-1.5 text-center text-[12px] text-mid">Código del error: {error.digest}. Si se repite, avísanos.</p> : null}
        <Button href="/" variant="link">
          Volver al inicio
        </Button>
      </div>
    </main>
  );
}
