/** Ciudades del piloto de «Mi día en la ciudad». Archivo sin dependencias para usarlo también en el navegador. */
export interface City {
  key: string;
  name: string;
  country: string;
  /** Punto de partida por defecto y centro de la búsqueda. */
  center: { lat: number; lon: number };
  anchorName: string;
  timezone: string;
}

/** Ciudades del piloto. */
export const CITIES: Record<string, City> = {
  "sao-paulo-br": { key: "sao-paulo-br", name: "São Paulo", country: "Brasil", center: { lat: -23.5614, lon: -46.6559 }, anchorName: "Av. Paulista", timezone: "America/Sao_Paulo" },
  "santiago-cl": { key: "santiago-cl", name: "Santiago", country: "Chile", center: { lat: -33.4372, lon: -70.6506 }, anchorName: "Plaza de Armas", timezone: "America/Santiago" },
  "valparaiso-cl": { key: "valparaiso-cl", name: "Valparaíso", country: "Chile", center: { lat: -33.0458, lon: -71.6197 }, anchorName: "Plaza Sotomayor", timezone: "America/Santiago" },
};
