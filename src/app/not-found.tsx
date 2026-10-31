import { FlapTile } from "@/components/FlapScore";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+48px)]">
      <div className="panel overflow-hidden rounded-[20px] bg-panel text-panel-fg">
        <div className="bg-stamp px-[18px] py-3 font-display text-[16px] font-extrabold text-white">Vuelo no encontrado</div>
        <div className="p-[18px]">
          <div className="flex gap-1.5" aria-hidden="true">
            <FlapTile char="4" size="lg" variant="panel" color="#FF8A78" />
            <FlapTile char="0" size="lg" variant="panel" color="#FF8A78" />
            <FlapTile char="4" size="lg" variant="panel" color="#FF8A78" />
          </div>
          <h1 className="cond mt-[18px] font-display text-[34px] font-extrabold leading-none tracking-[-0.5px]">
            Esta página no está en el tablero.
          </h1>
          <p className="mt-2.5 text-[15px] leading-[1.5] text-panel-fg2">
            Puede que el enlace esté mal escrito o que el destino ya no esté disponible. Tu búsqueda no se perdió.
          </p>
        </div>
      </div>
      <div className="mt-auto pt-8">
        <Button href="/" className="w-full">
          Volver al inicio
        </Button>
      </div>
    </main>
  );
}
