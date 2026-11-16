# Competencia y evidencia externa (investigación del 16-nov-2026)

Separa lo encontrado en la web de lo que es opinión nuestra. Limitaciones: la búsqueda es solo de EE. UU., varias fuentes son de los propios fabricantes (sesgadas) y **no se probó ningún competidor a mano**.

## Qué existe (según fuentes públicas)
- **Mindtrip:** planificador por chat con mapa y reserva de vuelos integrada (según comparativas de terceros).
- **Layla:** el mejor valorado en planificación de punta a punta; incluye monitoreo de tarifas. Su propia comparativa se pone primera.
- **Wanderlog:** descrito como organizador colaborativo, no como agente; versión de pago con offline y optimización de ruta.
- **TripIt Pro:** alertas de riesgo; son avisos, no reprogramación (no se encontró que cubra clima ni cierres de lugares).
- No se encontró evidencia de que Google Maps o Wanderlog **reprogramen solos** un itinerario por lluvia o cierre. Ausencia de evidencia, no prueba de ausencia.

## Evidencia de investigación
- **TravelPlanner (ICML 2024):** GPT-4-Turbo logró 0,6 % de planes que cumplen todas las restricciones; los agentes de lenguaje fallan al seguir varias restricciones a la vez. Un trabajo posterior (TravelBench) indica que los enfoques con solucionadores lo resolvieron rápido. → La calidad del plan debe vivir en el motor, no en el modelo.
- **TripTide (2025):** los itinerarios de LLM suponen un mundo sin imprevistos y rinden peor ante cierres o retrasos, tanto más cuanto más largo el itinerario.
- **Teoría:** el problema de armar un día turístico es el *Tourist Trip Design Problem* / *Orienteering Problem con ventanas de tiempo*; existe la variante estocástica con tiempos de traslado inciertos (Verbeeck, Vansteenwegen y Aghezzaf, EJOR 2016). Hay heurísticas conocidas: no hay que inventar el algoritmo.

## Transporte público: Transitous (probado hoy, 5 rutas reales)
`api.transitous.org` (motor MOTIS, comunidad, GTFS abiertos):
- Santiago: itinerarios reales con Metro (L1, L5) — p. ej. Plaza de Armas → Costanera Center 22–31 min.
- São Paulo: buses SPTrans — Paulista → Ibirapuera 49–56 min.
- **Valparaíso y Antofagasta: 0 itinerarios** (sin cobertura confirmada).
- Son horarios programados, no tiempo real. Es un servicio comunitario: depender de él en producción es un riesgo (alternativa: alojar MOTIS propio).

## Fuentes
TravelPlanner https://arxiv.org/pdf/2402.01622 · TravelBench https://arxiv.org/html/2512.22673v1 · TripTide https://arxiv.org/html/2510.21329v1 · TripIt Pro https://www.tripit.com/web/blog/news-culture/tripit-pro-risk-alerts · Transitous https://transitous.org/doc/ · MOTIS https://github.com/motis-project/motis · Layla https://layla.ai/it/blog/news-and-tips/ai-travel-planners-comparison · Wanderlog/Mindtrip (comparativas) https://dupple.com/learn/best-ai-for-trip-planning · OP/TTDP https://arxiv.org/pdf/2512.16865
