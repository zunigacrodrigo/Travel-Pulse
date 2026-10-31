import type { Source } from "@/lib/types";
import { FCDO_SOURCE_ID } from "./fcdo";
import { GDACS_SOURCE_ID } from "./gdacs";
import { USGS_SOURCE_ID } from "./usgs";

/** Fuentes en vivo (keyless). Se agregan al catálogo del dataset por el overlay. */
export const LIVE_SOURCES: readonly Source[] = [
  {
    id: FCDO_SOURCE_ID,
    name: "Aviso de viaje FCDO (Reino Unido)",
    license: "Open Government Licence v3.0 (verificar términos antes de producción)",
    maxAgeDays: 7,
    reliability: 0.9,
    url: "https://www.gov.uk/foreign-travel-advice",
  },
  {
    id: USGS_SOURCE_ID,
    name: "Sismos USGS (M4,5+)",
    license: "Dominio público (Gobierno de EE. UU.)",
    maxAgeDays: 1,
    reliability: 0.95,
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
  },
  {
    id: GDACS_SOURCE_ID,
    name: "GDACS (ONU y Comisión Europea): ciclones, inundaciones, volcanes e incendios",
    license: "Datos públicos del sistema GDACS (verificar términos antes de producción)",
    maxAgeDays: 1,
    reliability: 0.9,
    url: "https://www.gdacs.org/",
  },
];
