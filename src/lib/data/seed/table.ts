/**
 * Tabla curada compacta de los 30 destinos V1 (documento maestro, sección 5:
 * "Datos curados iniciales"). Una fila por destino con arreglos de 12 meses
 * (enero..diciembre). `build.ts` la expande a los tipos de `@/lib/types`.
 *
 * Convenciones:
 * - tags: [aventura, comida, cultura, naturaleza, playa, romance, desconocido, lujo], 0..5.
 * - season: 0..100 (100 = mejor mes). sat: 0..100 (más alto = MENOS saturado).
 * - costBase: costo diario medio por persona (USD) en un mes de saturación media;
 *   el costo mensual se ajusta por saturación (ver build.ts).
 * - temp (°C media), rain (mm/mes), wind (km/h): climatología aproximada 1991-2020.
 * - flight.base: ida y vuelta desde SCL por persona (USD) en mes de demanda media.
 * - flight.fixed: valores exactos por mes [flightUsd, usualFlightUsd]; null = sin dato.
 * - flight.deals: descuento actual vs. habitual por mes (0.15 = 15% bajo lo habitual).
 * - trend: [cambio de precio 30d %, cambio de interés de búsqueda 30d %].
 */

export type Motif = "mountains" | "sea" | "hills" | "city" | "desert";
export type Twelve = [number, number, number, number, number, number, number, number, number, number, number, number];

export interface DestRow {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  alt: number;
  tags: [number, number, number, number, number, number, number, number];
  risk: 1 | 2 | 3 | 4;
  riskReasons: string[];
  /** Desde SCL: [vuelo directo, horas de vuelo (más corta razonable), frecuencias semanales]. */
  conn: [boolean, number, number];
  similar: string[];
  blurb: string;
  /** [sky, sun, far, near, accent, motif] */
  poster: [string, string, string, string, string, Motif];
  season: Twelve;
  sat: Twelve;
  costBase: number;
  temp: Twelve;
  rain: Twelve;
  wind: number | Twelve;
  flight: {
    base: number;
    fixed?: Partial<Record<number, [number | null, number | null]>>;
    deals?: Partial<Record<number, number>>;
  };
  trend: [number, number];
  /** Datos deliberadamente ausentes (value null) por mes. */
  missing?: { saturation?: number[] };
  /** Fechas de observación vencidas para bajar la confianza. */
  stale?: {
    curation?: string;
    cost?: string;
    trends?: string;
    connectivity?: string;
  };
}

export const ROWS: DestRow[] = [
  /* ----------------------------- Perú ----------------------------- */
  {
    id: "CUZ", name: "Cusco", country: "Perú", lat: -13.5319, lon: -71.9675, alt: 3400,
    tags: [5, 4, 5, 4, 0, 3, 1, 3],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia común y protestas sociales que pueden cortar carreteras y la vía férrea a Machu Picchu.",
      "La altitud puede provocar mal de altura; se recomienda aclimatarse los primeros días.",
    ],
    conn: [true, 3.9, 7],
    similar: ["AQP", "SLA", "UYU"],
    blurb: "Capital inca entre montañas, puerta de entrada a Machu Picchu y el Valle Sagrado.",
    poster: ["#F2C14E", "#FFD400", "#B5562E", "#2E8B6F", "#E5412D", "mountains"],
    season: [35, 30, 50, 72, 85, 88, 82, 85, 86, 82, 81, 50],
    sat: [55, 65, 62, 58, 50, 35, 25, 30, 48, 58, 64, 52],
    costBase: 98,
    temp: [13.4, 13.3, 13.1, 12.6, 11.4, 10.2, 9.9, 11.1, 12.4, 13.6, 14.0, 13.6],
    rain: [160, 135, 110, 45, 10, 4, 4, 8, 25, 48, 72, 115],
    wind: 9,
    flight: { base: 560, fixed: { 11: [420, 520] }, deals: { 5: 0.12 } },
    trend: [-6, 4],
  },
  {
    id: "AQP", name: "Arequipa", country: "Perú", lat: -16.3989, lon: -71.535, alt: 2335,
    tags: [4, 4, 4, 4, 0, 3, 3, 2],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia común y protestas sociales que pueden afectar traslados por carretera.",
    ],
    conn: [false, 5.5, 21],
    similar: ["CUZ", "SLA"],
    blurb: "Ciudad blanca de sillar a los pies de volcanes, con cañones profundos y gran cocina.",
    poster: ["#9CC3DE", "#FFD400", "#E8EDF1", "#C9A27A", "#2C6FA3", "mountains"],
    season: [45, 40, 55, 75, 85, 88, 85, 88, 88, 85, 82, 60],
    sat: [70, 78, 76, 72, 70, 62, 55, 58, 72, 76, 80, 70],
    costBase: 86,
    temp: [15.0, 15.0, 15.0, 14.6, 14.0, 13.4, 13.3, 13.8, 14.4, 14.7, 14.9, 15.0],
    rain: [28, 40, 18, 1, 0, 0, 0, 1, 1, 0, 1, 6],
    wind: 10,
    flight: { base: 460, fixed: { 11: [400, 430] } },
    trend: [-2, 7],
  },
  {
    id: "LIM", name: "Lima", country: "Perú", lat: -12.0464, lon: -77.0428, alt: 154,
    tags: [2, 5, 4, 1, 2, 3, 1, 4],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia común, especialmente robos en transporte y zonas concurridas.",
      "Protestas sociales ocasionales en el centro de la ciudad.",
    ],
    conn: [true, 3.6, 70],
    similar: ["BOG", "AEP", "MEX"],
    blurb: "Capital gastronómica del continente, frente al Pacífico y con centro colonial.",
    poster: ["#C7D3DD", "#F2A541", "#7C8B99", "#0B1626", "#E5412D", "city"],
    season: [88, 90, 82, 72, 60, 55, 52, 52, 58, 65, 75, 85],
    sat: [50, 55, 62, 70, 75, 72, 62, 70, 74, 72, 68, 58],
    costBase: 95,
    temp: [23.0, 24.0, 23.5, 21.5, 19.5, 18.0, 17.0, 16.5, 16.8, 17.8, 19.5, 21.5],
    rain: [1, 1, 1, 0, 1, 2, 3, 3, 2, 1, 0, 1],
    wind: 14,
    flight: { base: 380, deals: { 5: 0.15, 9: 0.1 } },
    trend: [-4, 2],
  },

  /* --------------------------- Argentina --------------------------- */
  {
    id: "SLA", name: "Salta", country: "Argentina", lat: -24.7821, lon: -65.4232, alt: 1152,
    tags: [4, 4, 4, 5, 0, 3, 3, 2],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; se aplican precauciones normales de viaje."],
    conn: [false, 6.5, 14],
    similar: ["AQP", "MDZ", "UYU"],
    blurb: "Quebradas de colores, vino de altura y peñas folclóricas en el norte argentino.",
    poster: ["#F6D7A7", "#FFD400", "#C8553D", "#2E8B6F", "#2C6FA3", "desert"],
    season: [50, 52, 70, 82, 78, 70, 72, 80, 85, 84, 78, 60],
    sat: [60, 70, 75, 72, 80, 74, 50, 72, 80, 76, 83, 68],
    costBase: 65,
    temp: [20.8, 20.1, 19.1, 16.6, 13.7, 11.2, 10.6, 13.0, 15.8, 19.0, 20.4, 21.2],
    rain: [180, 150, 100, 25, 7, 2, 3, 4, 6, 25, 55, 115],
    wind: 8,
    flight: { base: 460, fixed: { 11: [410, 430] }, deals: { 9: 0.14 } },
    trend: [-3, 18],
  },
  {
    id: "MDZ", name: "Mendoza", country: "Argentina", lat: -32.8895, lon: -68.8458, alt: 746,
    tags: [4, 5, 2, 4, 0, 5, 2, 4],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; el paso Los Libertadores puede cerrarse por nieve en invierno."],
    conn: [true, 1.0, 35],
    similar: ["SLA", "BRC"],
    blurb: "Bodegas al pie de la cordillera, con rutas de vino, montaña y buena mesa.",
    poster: ["#F4C7A1", "#FFD400", "#6E4A7E", "#2E8B6F", "#E5412D", "hills"],
    season: [70, 85, 92, 88, 72, 55, 58, 62, 75, 85, 88, 78],
    sat: [55, 48, 40, 62, 72, 70, 52, 74, 70, 64, 68, 58],
    costBase: 85,
    temp: [25.0, 23.6, 21.0, 16.5, 12.3, 8.7, 8.0, 10.5, 13.8, 18.0, 21.5, 24.0],
    rain: [40, 40, 30, 10, 8, 4, 5, 6, 12, 15, 20, 30],
    wind: 10,
    flight: { base: 220, deals: { 4: 0.18 } },
    trend: [2, 5],
  },
  {
    id: "BRC", name: "Bariloche", country: "Argentina", lat: -41.1335, lon: -71.3103, alt: 893,
    tags: [5, 3, 1, 5, 1, 4, 1, 4],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; en invierno hay cortes de ruta por nieve."],
    conn: [false, 4.5, 14],
    similar: ["PUQ", "MDZ"],
    blurb: "Lagos y bosques patagónicos con chocolate, trekking y esquí en invierno.",
    poster: ["#A9CBE0", "#FFD400", "#E8EDF1", "#2E8B6F", "#2C6FA3", "mountains"],
    season: [82, 85, 75, 62, 40, 55, 85, 82, 60, 50, 62, 78],
    sat: [30, 38, 64, 74, 82, 62, 25, 40, 70, 82, 78, 55],
    costBase: 110,
    temp: [15.5, 15.5, 12.5, 9.0, 5.5, 3.0, 2.5, 3.5, 6.0, 9.0, 11.5, 14.0],
    rain: [25, 20, 35, 60, 125, 140, 130, 110, 60, 40, 30, 25],
    wind: 20,
    flight: { base: 330, deals: { 10: 0.12 } },
    trend: [1, 3],
  },
  {
    id: "AEP", name: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816, alt: 25,
    tags: [1, 5, 5, 1, 0, 4, 0, 4],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; precaución por hurtos en zonas turísticas y transporte."],
    conn: [true, 2.1, 120],
    similar: ["MVD", "MEX", "LIM"],
    blurb: "Ciudad de cafés, tango, librerías y parrillas que no duerme.",
    poster: ["#BFD7EA", "#F2A541", "#2C6FA3", "#0B1626", "#FFD400", "city"],
    season: [60, 62, 78, 85, 72, 58, 58, 62, 82, 88, 86, 70],
    sat: [60, 65, 68, 72, 80, 78, 65, 75, 72, 68, 70, 62],
    costBase: 90,
    temp: [24.8, 23.8, 22.0, 18.0, 14.6, 11.6, 10.8, 12.5, 14.6, 17.7, 20.8, 23.4],
    rain: [110, 120, 120, 105, 80, 55, 60, 60, 70, 115, 110, 105],
    wind: 15,
    flight: { base: 260, deals: { 3: 0.15, 11: 0.1 } },
    trend: [-5, 3],
  },
  {
    id: "IGR", name: "Puerto Iguazú", country: "Argentina", lat: -25.5972, lon: -54.5786, alt: 190,
    tags: [4, 2, 1, 5, 0, 3, 2, 3],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; precauciones normales en zona de triple frontera."],
    conn: [false, 5.0, 14],
    similar: ["SJO", "GPS"],
    blurb: "Cataratas en plena selva subtropical, en la triple frontera.",
    poster: ["#9FD3C7", "#FFD400", "#2E8B6F", "#1F5E4A", "#2C6FA3", "hills"],
    season: [55, 58, 72, 82, 85, 72, 65, 75, 85, 80, 68, 55],
    sat: [40, 52, 64, 72, 80, 70, 42, 68, 74, 70, 72, 58],
    costBase: 85,
    temp: [26.5, 26.0, 25.0, 21.5, 18.5, 16.0, 15.5, 17.5, 19.5, 22.0, 24.0, 26.0],
    rain: [170, 150, 130, 170, 150, 110, 90, 90, 150, 210, 170, 170],
    wind: 9,
    flight: { base: 430 },
    trend: [0, 6],
  },

  /* ----------------------------- Chile ----------------------------- */
  {
    id: "LSC", name: "La Serena", country: "Chile", lat: -29.9027, lon: -71.2519, alt: 28,
    tags: [2, 3, 2, 3, 4, 2, 2, 2],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; zona sísmica con protocolos de tsunami señalizados."],
    conn: [true, 1.0, 70],
    similar: ["PDP", "FLN"],
    blurb: "Playas, valle del Elqui y cielos limpios para mirar estrellas.",
    poster: ["#F7D08A", "#FFD400", "#6E7FA8", "#2C6FA3", "#E5412D", "sea"],
    season: [92, 90, 72, 55, 40, 38, 45, 48, 60, 65, 75, 85],
    sat: [22, 28, 62, 72, 85, 82, 55, 78, 58, 70, 74, 50],
    costBase: 75,
    temp: [18.5, 18.7, 17.3, 15.3, 13.7, 12.3, 11.7, 12.0, 12.8, 14.0, 15.5, 17.3],
    rain: [0, 0, 1, 3, 18, 25, 25, 15, 5, 2, 1, 0],
    wind: 13,
    flight: { base: 150, deals: { 5: 0.2, 10: 0.12 } },
    trend: [3, -2],
  },
  {
    id: "IPC", name: "Isla de Pascua", country: "Chile", lat: -27.15, lon: -109.4333, alt: 40,
    tags: [3, 2, 5, 4, 3, 4, 4, 3],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; acceso solo aéreo y atención médica limitada en la isla."],
    conn: [true, 5.3, 7],
    similar: ["GPS", "LSC"],
    blurb: "Moáis, cultura rapa nui y océano abierto en la isla más remota.",
    poster: ["#7FB7D9", "#FFD400", "#2E8B6F", "#4B3B2F", "#E5412D", "sea"],
    season: [85, 90, 82, 70, 58, 50, 52, 55, 65, 75, 80, 82],
    sat: [40, 25, 55, 70, 80, 82, 70, 78, 74, 72, 68, 60],
    costBase: 150,
    temp: [23.8, 24.3, 23.8, 22.5, 20.8, 19.5, 18.5, 18.3, 18.5, 19.3, 20.8, 22.5],
    rain: [85, 90, 110, 120, 145, 110, 105, 95, 80, 70, 85, 85],
    wind: 18,
    flight: { base: 640, deals: { 6: 0.15 } },
    trend: [4, 5],
  },
  {
    id: "PUQ", name: "Punta Arenas", country: "Chile", lat: -53.1638, lon: -70.9171, alt: 34,
    tags: [5, 3, 2, 5, 0, 2, 4, 2],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; viento fuerte y clima cambiante en rutas australes."],
    conn: [true, 3.3, 56],
    similar: ["BRC", "UYU"],
    blurb: "Puerta de la Patagonia austral, Torres del Paine y el estrecho de Magallanes.",
    poster: ["#B9D4E6", "#F2C14E", "#E8EDF1", "#2C6FA3", "#0B1626", "mountains"],
    season: [92, 88, 72, 48, 25, 22, 30, 35, 50, 68, 85, 92],
    sat: [40, 45, 64, 82, 92, 90, 85, 88, 84, 74, 58, 45],
    costBase: 110,
    temp: [11.2, 10.8, 9.2, 6.8, 4.1, 2.0, 1.7, 2.8, 4.9, 7.3, 8.9, 10.4],
    rain: [35, 30, 40, 40, 40, 35, 30, 35, 25, 25, 25, 30],
    wind: [30, 28, 25, 22, 20, 19, 19, 21, 24, 27, 30, 31],
    flight: { base: 260, deals: { 4: 0.2, 10: 0.1 } },
    trend: [-2, 8],
  },

  /* ----------------------------- México ----------------------------- */
  {
    id: "OAX", name: "Oaxaca", country: "México", lat: 17.0732, lon: -96.7266, alt: 1555,
    tags: [3, 5, 5, 3, 1, 3, 3, 2],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia y bloqueos ocasionales de carreteras por protestas sociales.",
    ],
    conn: [false, 11.5, 14],
    similar: ["MEX", "CUZ", "CTG"],
    blurb: "Mercados, mezcal y tradición zapoteca en una ciudad colonial de piedra verde.",
    poster: ["#F28C6B", "#FFD400", "#2E8B6F", "#7A3E6B", "#E5412D", "hills"],
    // Guelaguetza en julio, Día de Muertos a inicios de noviembre, fiestas de diciembre.
    season: [82, 85, 82, 70, 60, 52, 72, 60, 55, 70, 85, 80],
    sat: [70, 74, 62, 60, 78, 80, 40, 72, 82, 68, 58, 48],
    costBase: 82,
    temp: [17.8, 19.0, 21.0, 22.5, 22.8, 21.5, 20.6, 20.8, 20.4, 19.5, 18.6, 17.9],
    rain: [3, 4, 8, 30, 70, 155, 95, 100, 135, 45, 8, 4],
    wind: 7,
    flight: { base: 860, fixed: { 11: [780, 800] } },
    trend: [2, 10],
  },
  {
    id: "MEX", name: "Ciudad de México", country: "México", lat: 19.4326, lon: -99.1332, alt: 2240,
    tags: [1, 5, 5, 1, 0, 3, 1, 4],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia común, incluidos robos en transporte y taxis no autorizados.",
      "Zona de alta sismicidad con alerta sísmica pública.",
    ],
    conn: [true, 8.8, 14],
    similar: ["OAX", "BOG", "AEP"],
    blurb: "Megaciudad de museos, taquerías y barrios con vida propia.",
    poster: ["#F6B9A6", "#FFD400", "#2C6FA3", "#0B1626", "#E5412D", "city"],
    season: [75, 80, 85, 78, 68, 55, 55, 58, 60, 72, 85, 78],
    sat: [62, 64, 58, 52, 70, 72, 60, 72, 68, 64, 52, 48],
    costBase: 90,
    temp: [14.5, 16.0, 18.0, 19.5, 19.8, 19.0, 17.8, 18.0, 17.6, 16.7, 15.5, 14.6],
    rain: [8, 6, 10, 25, 55, 135, 170, 160, 135, 60, 10, 6],
    wind: 9,
    flight: { base: 740, deals: { 5: 0.12, 8: 0.1 } },
    trend: [-3, 4],
  },
  {
    id: "CUN", name: "Cancún", country: "México", lat: 21.1619, lon: -86.8515, alt: 10,
    tags: [2, 3, 2, 3, 5, 4, 0, 5],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia en zonas fuera del corredor hotelero.",
      "Temporada de huracanes de junio a noviembre.",
    ],
    conn: [true, 8.5, 7],
    similar: ["CTG", "SSA"],
    blurb: "Caribe turquesa, cenotes y ruinas mayas con hotelería de todo tipo.",
    poster: ["#7FD1D9", "#FFD400", "#2C6FA3", "#F2D7A6", "#E5412D", "sea"],
    season: [88, 92, 88, 80, 62, 48, 58, 55, 35, 45, 72, 85],
    sat: [35, 38, 30, 40, 62, 62, 40, 55, 82, 74, 60, 28],
    costBase: 160,
    temp: [24.0, 24.6, 25.6, 27.0, 28.0, 28.5, 28.5, 28.6, 28.0, 27.0, 25.8, 24.6],
    rain: [80, 45, 35, 40, 90, 170, 90, 110, 210, 250, 110, 85],
    wind: 15,
    flight: { base: 840, deals: { 9: 0.18 } },
    trend: [5, 2],
  },

  /* ---------------------------- Colombia ---------------------------- */
  {
    id: "MDE", name: "Medellín", country: "Colombia", lat: 6.2442, lon: -75.5812, alt: 1495,
    tags: [3, 4, 4, 4, 0, 3, 2, 3],
    risk: 3,
    riskReasons: [
      "Aviso oficial de reconsiderar el viaje a Colombia por delincuencia y presencia de grupos armados en zonas rurales.",
      "Las zonas turísticas urbanas operan con normalidad; se recomienda no aceptar bebidas de desconocidos.",
    ],
    conn: [true, 6.2, 10],
    similar: ["BOG", "SJO", "UIO"],
    blurb: "Ciudad de la eterna primavera, entre montañas verdes y barrios renovados.",
    poster: ["#9ED9B8", "#FFD400", "#2E8B6F", "#1F5E4A", "#E5412D", "hills"],
    // Feria de las Flores en agosto; temporadas de lluvia abr-may y oct-nov.
    season: [85, 80, 62, 48, 45, 62, 75, 78, 60, 45, 62, 82],
    sat: [55, 68, 70, 72, 78, 70, 45, 30, 72, 74, 72, 50],
    costBase: 95,
    temp: [22.0, 22.4, 22.6, 22.3, 22.2, 22.3, 22.6, 22.7, 22.1, 21.4, 21.4, 21.6],
    rain: [60, 85, 130, 200, 230, 150, 130, 155, 190, 240, 170, 90],
    wind: 6,
    flight: { base: 540, fixed: { 11: [530, 500] } },
    trend: [9, 6],
  },
  {
    id: "BOG", name: "Bogotá", country: "Colombia", lat: 4.711, lon: -74.0721, alt: 2640,
    tags: [2, 4, 5, 2, 0, 2, 2, 3],
    risk: 3,
    riskReasons: [
      "Aviso oficial de reconsiderar el viaje a Colombia por delincuencia y presencia de grupos armados en zonas rurales.",
      "Precaución por robos en transporte público y taxis tomados en la calle.",
    ],
    conn: [true, 5.8, 21],
    similar: ["MDE", "UIO", "MEX"],
    blurb: "Capital andina de museos, cafés y cultura callejera.",
    poster: ["#C9D6C3", "#F2C14E", "#2E8B6F", "#0B1626", "#E5412D", "city"],
    season: [82, 80, 65, 50, 52, 65, 75, 74, 65, 50, 55, 75],
    sat: [70, 78, 72, 76, 78, 70, 68, 72, 76, 74, 74, 70],
    costBase: 80,
    temp: [13.3, 13.7, 14.0, 14.2, 14.2, 13.8, 13.5, 13.6, 13.6, 13.6, 13.7, 13.5],
    rain: [35, 45, 65, 110, 100, 50, 40, 45, 60, 110, 90, 55],
    wind: 9,
    flight: { base: 520, deals: { 10: 0.16 } },
    trend: [-1, 2],
  },
  {
    id: "CTG", name: "Cartagena", country: "Colombia", lat: 10.391, lon: -75.4794, alt: 2,
    tags: [1, 4, 4, 1, 4, 5, 1, 4],
    risk: 3,
    riskReasons: [
      "Aviso oficial de reconsiderar el viaje a Colombia por delincuencia y presencia de grupos armados en zonas rurales.",
      "Precaución por estafas y robos a turistas en el centro histórico de noche.",
    ],
    conn: [false, 7.5, 14],
    similar: ["HAV", "CUN", "SSA"],
    blurb: "Murallas coloniales, calles de colores y el Caribe a la vuelta de la esquina.",
    poster: ["#F7C59F", "#FFD400", "#E5412D", "#2C6FA3", "#2E8B6F", "sea"],
    season: [90, 90, 88, 75, 60, 62, 65, 62, 52, 45, 62, 85],
    sat: [25, 52, 48, 50, 72, 58, 42, 62, 78, 72, 62, 25],
    costBase: 110,
    temp: [27.0, 27.2, 27.6, 28.1, 28.5, 28.6, 28.5, 28.6, 28.3, 28.0, 27.9, 27.6],
    rain: [3, 1, 1, 20, 90, 95, 90, 110, 130, 220, 140, 40],
    wind: 18,
    flight: { base: 620, deals: { 9: 0.15 } },
    trend: [3, 9],
  },

  /* ----------------------------- Brasil ----------------------------- */
  {
    id: "FLN", name: "Florianópolis", country: "Brasil", lat: -27.5954, lon: -48.548, alt: 10,
    tags: [3, 3, 2, 4, 5, 4, 2, 3],
    risk: 2,
    riskReasons: ["Precaución por hurtos en playas concurridas y robos en vehículos estacionados."],
    conn: [true, 3.2, 10],
    similar: ["GIG", "PDP", "SSA"],
    blurb: "Isla de playas y lagunas con surf, mariscos y vida tranquila.",
    poster: ["#8FD3E8", "#FFD400", "#2E8B6F", "#2C6FA3", "#E5412D", "sea"],
    season: [95, 92, 80, 62, 45, 35, 35, 38, 50, 62, 70, 85],
    sat: [18, 25, 60, 78, 88, 90, 88, 90, 86, 80, 72, 40],
    costBase: 90,
    temp: [25.0, 25.3, 24.4, 22.3, 19.6, 17.5, 16.6, 17.2, 18.3, 20.0, 21.8, 23.6],
    rain: [185, 195, 165, 105, 105, 80, 85, 95, 125, 135, 140, 160],
    wind: 15,
    // Noviembre sin precio observado: la ruta directa estacional aún no publica tarifas.
    flight: { base: 390, fixed: { 11: [null, null] } },
    trend: [1, 12],
    missing: { saturation: [11] },
    stale: { curation: "2025-01-15", cost: "2025-01-15", trends: "2026-05-10", connectivity: "2025-06-01" },
  },
  {
    id: "GIG", name: "Río de Janeiro", country: "Brasil", lat: -22.9068, lon: -43.1729, alt: 5,
    tags: [3, 3, 4, 4, 5, 4, 0, 4],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia en zonas urbanas, especialmente de noche y en playas concurridas.",
    ],
    conn: [true, 4.1, 28],
    similar: ["SSA", "FLN"],
    blurb: "Morros, playas urbanas y samba entre el mar y la selva.",
    poster: ["#7CC6E8", "#FFD400", "#2E8B6F", "#1F5E4A", "#E5412D", "sea"],
    // Carnaval en febrero, Año Nuevo en diciembre.
    season: [92, 95, 85, 78, 70, 68, 68, 70, 72, 78, 82, 88],
    sat: [35, 20, 58, 65, 74, 74, 64, 70, 70, 68, 62, 25],
    costBase: 105,
    temp: [26.6, 27.0, 26.4, 24.8, 23.2, 22.0, 21.6, 22.0, 22.2, 23.4, 24.6, 25.8],
    rain: [135, 125, 135, 95, 70, 50, 45, 45, 55, 90, 105, 140],
    wind: 12,
    flight: { base: 430, deals: { 6: 0.18, 11: 0.08 } },
    trend: [-4, 6],
  },
  {
    id: "SSA", name: "Salvador de Bahía", country: "Brasil", lat: -12.9777, lon: -38.5016, alt: 8,
    tags: [1, 5, 5, 2, 4, 3, 2, 2],
    risk: 2,
    riskReasons: [
      "Precaución por delincuencia en zonas urbanas; se recomienda moverse en taxi o aplicación de noche.",
    ],
    conn: [true, 5.8, 3],
    similar: ["GIG", "CTG", "HAV"],
    blurb: "Corazón afrobrasileño de música, capoeira y cocina bahiana.",
    poster: ["#F9D976", "#FFD400", "#E5412D", "#2C6FA3", "#2E8B6F", "sea"],
    season: [90, 92, 72, 48, 40, 50, 55, 62, 72, 80, 85, 88],
    sat: [40, 22, 60, 78, 82, 62, 62, 72, 72, 68, 62, 42],
    costBase: 85,
    temp: [27.0, 27.4, 27.4, 26.6, 25.6, 24.6, 23.9, 24.0, 24.6, 25.4, 26.0, 26.6],
    rain: [110, 115, 155, 330, 330, 240, 190, 120, 100, 110, 120, 95],
    wind: 14,
    flight: { base: 540, deals: { 10: 0.14 } },
    trend: [0, 4],
  },

  /* ----------------------------- Uruguay ----------------------------- */
  {
    id: "MVD", name: "Montevideo", country: "Uruguay", lat: -34.9011, lon: -56.1645, alt: 43,
    tags: [1, 4, 3, 1, 2, 3, 3, 2],
    risk: 2,
    riskReasons: ["Precaución por aumento de delitos contra la propiedad en zonas urbanas."],
    conn: [true, 2.2, 28],
    similar: ["AEP", "PDP", "ASU"],
    blurb: "Rambla, ferias y candombe en una capital de ritmo pausado.",
    poster: ["#BCD9EA", "#FFD400", "#2C6FA3", "#0B1626", "#E5412D", "city"],
    // Carnaval en febrero, Semana de Turismo en abril.
    season: [85, 82, 80, 68, 50, 40, 45, 48, 60, 72, 78, 82],
    sat: [55, 48, 68, 58, 80, 82, 72, 82, 78, 74, 70, 62],
    costBase: 105,
    temp: [23.0, 22.4, 20.6, 17.3, 14.2, 11.2, 10.8, 11.8, 13.4, 16.0, 18.8, 21.5],
    rain: [95, 105, 105, 95, 90, 85, 90, 90, 95, 105, 95, 85],
    wind: 18,
    flight: { base: 290, deals: { 5: 0.15 } },
    trend: [-2, -1],
  },
  {
    id: "PDP", name: "Punta del Este", country: "Uruguay", lat: -34.9667, lon: -54.95, alt: 5,
    tags: [1, 3, 1, 2, 5, 4, 0, 5],
    risk: 1,
    riskReasons: ["Sin alertas oficiales específicas; precauciones normales de viaje."],
    conn: [false, 4.0, 7],
    similar: ["FLN", "MVD"],
    blurb: "Balneario de playas abiertas y noches de verano en la costa uruguaya.",
    poster: ["#9BD0E6", "#FFD400", "#E8EDF1", "#2C6FA3", "#E5412D", "sea"],
    season: [98, 92, 72, 48, 30, 22, 25, 28, 40, 52, 62, 82],
    sat: [8, 18, 60, 72, 88, 92, 88, 90, 88, 84, 78, 30],
    costBase: 160,
    temp: [21.5, 21.4, 20.0, 17.0, 14.0, 11.5, 10.8, 11.6, 13.0, 15.4, 18.0, 20.2],
    rain: [85, 95, 95, 100, 85, 85, 85, 85, 85, 90, 80, 80],
    wind: 20,
    flight: { base: 360 },
    trend: [6, 3],
  },

  /* ----------------------------- Ecuador ----------------------------- */
  {
    id: "UIO", name: "Quito", country: "Ecuador", lat: -0.1807, lon: -78.4678, alt: 2850,
    tags: [3, 3, 4, 4, 0, 2, 3, 2],
    risk: 2,
    riskReasons: [
      "Precaución por aumento de la delincuencia y estados de excepción vigentes en algunas provincias.",
      "La altitud puede provocar mal de altura los primeros días.",
    ],
    conn: [false, 6.0, 14],
    similar: ["BOG", "CUZ"],
    blurb: "Centro histórico andino rodeado de volcanes, cerca de la mitad del mundo.",
    poster: ["#B7D3E9", "#FFD400", "#2E8B6F", "#4A5B70", "#E5412D", "mountains"],
    season: [62, 58, 52, 48, 62, 82, 88, 88, 78, 62, 62, 70],
    sat: [68, 70, 72, 70, 72, 62, 55, 58, 72, 72, 74, 62],
    costBase: 70,
    temp: [14.0, 14.0, 14.0, 14.0, 14.1, 13.9, 13.9, 14.3, 14.4, 14.2, 13.9, 14.0],
    rain: [100, 130, 155, 175, 110, 40, 20, 25, 80, 130, 105, 95],
    wind: 9,
    flight: { base: 560, deals: { 11: 0.12 } },
    trend: [-3, 1],
  },
  {
    id: "GPS", name: "Galápagos", country: "Ecuador", lat: -0.7432, lon: -90.3138, alt: 10,
    tags: [4, 2, 1, 5, 4, 4, 3, 5],
    risk: 1,
    riskReasons: ["Sin alertas específicas para las islas; ingreso regulado por el Parque Nacional Galápagos."],
    conn: [false, 9.0, 7],
    similar: ["IPC", "SJO"],
    blurb: "Islas volcánicas con fauna única que no le teme al visitante.",
    poster: ["#7FC8D6", "#FFD400", "#4B3B2F", "#2E8B6F", "#E5412D", "sea"],
    season: [78, 80, 82, 82, 80, 72, 72, 68, 68, 72, 78, 80],
    sat: [52, 60, 62, 64, 66, 48, 40, 42, 70, 64, 62, 42],
    costBase: 210,
    temp: [25.5, 26.5, 26.8, 26.2, 24.8, 23.3, 22.2, 21.3, 21.4, 22.0, 22.8, 24.2],
    rain: [25, 45, 60, 40, 10, 10, 10, 8, 10, 8, 8, 15],
    wind: 14,
    flight: { base: 1080, deals: { 9: 0.1 } },
    trend: [2, 3],
  },

  /* ----------------------------- Bolivia ----------------------------- */
  {
    id: "UYU", name: "Uyuni", country: "Bolivia", lat: -20.46, lon: -66.825, alt: 3656,
    tags: [5, 1, 2, 5, 0, 3, 4, 1],
    risk: 2,
    riskReasons: [
      "Bloqueos de carreteras y protestas pueden interrumpir los traslados.",
      "Altitud elevada y atención médica limitada fuera de las ciudades.",
    ],
    conn: [false, 6.0, 7],
    similar: ["SLA", "CUZ"],
    blurb: "Salar infinito, lagunas de colores y desierto de altura.",
    poster: ["#D9E8F5", "#FFD400", "#E8EDF1", "#C9A27A", "#2C6FA3", "desert"],
    // Enero-febrero: efecto espejo del salar con lluvias.
    season: [55, 60, 65, 85, 88, 85, 80, 82, 82, 80, 72, 52],
    sat: [52, 64, 72, 62, 78, 72, 48, 62, 72, 72, 74, 55],
    costBase: 60,
    temp: [13.0, 12.5, 11.8, 9.0, 5.0, 2.5, 2.0, 4.5, 7.5, 10.0, 11.5, 12.5],
    rain: [60, 45, 20, 3, 1, 0, 0, 1, 2, 3, 5, 25],
    wind: [15, 15, 15, 16, 16, 17, 18, 22, 22, 20, 18, 16],
    flight: { base: 530 },
    trend: [0, 7],
  },

  /* ---------------------------- Paraguay ---------------------------- */
  {
    id: "ASU", name: "Asunción", country: "Paraguay", lat: -25.2637, lon: -57.5759, alt: 43,
    tags: [1, 3, 3, 2, 0, 1, 5, 1],
    risk: 1,
    riskReasons: ["Sin alertas oficiales vigentes; precauciones normales en zonas urbanas."],
    conn: [true, 2.6, 14],
    similar: ["MVD", "SLA"],
    blurb: "Capital poco visitada junto al río, con historia guaraní y ritmo tranquilo.",
    poster: ["#F3C9A0", "#FFD400", "#2E8B6F", "#B5562E", "#2C6FA3", "city"],
    season: [40, 45, 55, 72, 82, 82, 80, 78, 75, 68, 55, 45],
    sat: [85, 88, 85, 84, 86, 84, 80, 84, 84, 84, 84, 82],
    costBase: 60,
    temp: [28.5, 28.0, 27.0, 24.0, 20.5, 18.5, 18.0, 20.0, 21.5, 24.5, 26.0, 28.0],
    rain: [150, 130, 130, 150, 120, 75, 45, 60, 80, 140, 150, 155],
    wind: 10,
    flight: { base: 380, deals: { 8: 0.12 } },
    trend: [0, 1],
    // Curaduría y costo sin revisar desde el piloto: datos deliberadamente vencidos.
    stale: { curation: "2025-03-12", cost: "2025-02-01", trends: "2026-06-01" },
  },

  /* ------------------------ Centroamérica y Caribe ------------------------ */
  {
    id: "PTY", name: "Ciudad de Panamá", country: "Panamá", lat: 8.9824, lon: -79.5199, alt: 10,
    tags: [2, 3, 3, 3, 3, 3, 2, 4],
    risk: 2,
    riskReasons: ["Precaución por delincuencia en algunas zonas urbanas; evitar la región del Darién."],
    conn: [true, 6.5, 14],
    similar: ["CTG", "SJO"],
    blurb: "Rascacielos, casco antiguo y el canal que une dos océanos.",
    poster: ["#9FD8E0", "#FFD400", "#2C6FA3", "#0B1626", "#2E8B6F", "city"],
    season: [85, 88, 85, 72, 52, 50, 52, 50, 45, 42, 50, 72],
    sat: [58, 62, 62, 68, 78, 76, 70, 74, 80, 80, 74, 52],
    costBase: 110,
    temp: [27.5, 27.8, 28.2, 28.4, 27.9, 27.4, 27.4, 27.3, 27.0, 26.8, 26.8, 27.1],
    rain: [30, 10, 15, 70, 215, 215, 180, 215, 240, 280, 250, 110],
    wind: 12,
    flight: { base: 570, deals: { 10: 0.15 } },
    trend: [-2, 0],
  },
  {
    id: "SJO", name: "San José", country: "Costa Rica", lat: 9.9281, lon: -84.0907, alt: 1170,
    tags: [5, 2, 2, 5, 3, 3, 2, 3],
    risk: 2,
    riskReasons: ["Precaución por delincuencia, incluidos robos a turistas y en vehículos de arriendo."],
    conn: [false, 8.5, 14],
    similar: ["MDE", "PTY", "GPS"],
    blurb: "Puerta a volcanes, bosques nubosos y playas en dos costas.",
    poster: ["#A8DCC1", "#FFD400", "#2E8B6F", "#1F5E4A", "#E5412D", "mountains"],
    season: [88, 92, 90, 82, 58, 52, 62, 55, 45, 42, 62, 82],
    sat: [40, 44, 38, 46, 74, 72, 52, 68, 80, 82, 70, 38],
    costBase: 105,
    temp: [20.5, 21.0, 21.8, 22.4, 22.3, 21.6, 21.3, 21.4, 21.3, 21.0, 20.7, 20.4],
    rain: [10, 5, 15, 40, 230, 270, 190, 250, 320, 310, 150, 40],
    wind: 13,
    flight: { base: 690, deals: { 5: 0.14 } },
    trend: [1, 5],
  },
  {
    id: "HAV", name: "La Habana", country: "Cuba", lat: 23.1136, lon: -82.3666, alt: 59,
    tags: [1, 3, 5, 1, 3, 4, 2, 2],
    risk: 2,
    riskReasons: [
      "Cortes de electricidad frecuentes y escasez de combustible, alimentos y medicamentos.",
      "Temporada de huracanes de junio a noviembre.",
    ],
    conn: [false, 10.5, 7],
    similar: ["CTG", "SSA"],
    blurb: "Calles de arquitectura colonial, música en vivo y malecón frente al mar.",
    poster: ["#F7B7A3", "#FFD400", "#2C6FA3", "#E5412D", "#2E8B6F", "city"],
    season: [88, 88, 85, 78, 65, 52, 55, 50, 40, 45, 72, 82],
    sat: [52, 55, 52, 58, 72, 66, 58, 64, 82, 78, 66, 48],
    costBase: 95,
    temp: [22.2, 22.5, 23.7, 25.0, 26.4, 27.4, 27.9, 28.0, 27.4, 26.3, 24.5, 23.0],
    rain: [65, 70, 45, 55, 100, 180, 105, 140, 150, 180, 85, 60],
    wind: 14,
    flight: { base: 840 },
    trend: [-1, -4],
  },
  {
    id: "PMV", name: "Isla Margarita", country: "Venezuela", lat: 10.9577, lon: -63.8697, alt: 10,
    tags: [2, 2, 1, 3, 5, 3, 3, 2],
    risk: 4,
    riskReasons: [
      "Aviso oficial de no viajar a Venezuela.",
      "Riesgo de detenciones arbitrarias, delincuencia violenta y disturbios civiles.",
      "Servicios consulares y atención médica limitados.",
    ],
    conn: [false, 11.0, 3],
    similar: ["CTG", "CUN"],
    blurb: "Isla caribeña de playas amplias y viento constante.",
    poster: ["#8ED3DA", "#FFD400", "#2C6FA3", "#F2D7A6", "#E5412D", "sea"],
    season: [82, 85, 85, 80, 70, 62, 65, 65, 65, 62, 70, 80],
    sat: [60, 58, 52, 65, 75, 70, 58, 66, 75, 76, 72, 50],
    costBase: 85,
    temp: [26.5, 26.5, 27.0, 27.5, 28.0, 27.8, 27.5, 27.8, 28.0, 28.0, 27.5, 27.0],
    rain: [20, 10, 5, 10, 25, 50, 60, 55, 40, 50, 55, 40],
    wind: 20,
    flight: { base: 920 },
    trend: [0, -6],
  },
];
