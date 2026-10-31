# Catálogo de fuentes de datos (Prompt Maestro §14)

Fecha: 31-oct-2026 · Versión 0.3.0. **Clase de confianza** según el documento de arquitectura.

| Fuente | Clase | Qué aporta | Licencia / términos | Actualización | Fiabilidad base | Límites | Costo | Si falla |
|---|---|---|---|---|---|---|---|---|
| **FCDO (GOV.UK)** `fcdo` | Oficial (un solo gobierno: Reino Unido) | Nivel de riesgo 1–4 por país → factor «riesgo» | Open Government Licence v3.0 — *verificar términos antes de producción* | Consulta cada 6 h; se considera vigente 7 días | 0,90 | Es la postura del Reino Unido, no un consenso; 14 países | Gratis, sin clave | Conserva el último dato bueno y lo marca «desactualizada»; sin ninguno, usa la semilla y lo dice |
| **USGS sismos M4,5+** `usgs` | Oficial (EE. UU.) | Sismos del último mes cerca de cada destino. **Informativo, no entra al puntaje** | Dominio público | Cada 10 min; vigente 1 día | 0,95 | Solo M4,5+; se informa, no se predice | Gratis, sin clave | Igual que arriba |
| Open-Meteo | Proveedor externo | Clima y geocodificación en `/ciudad` | CC BY 4.0 (no comercial) | Bajo demanda | 0,85 | Uso comercial requiere plan | Gratis | Mensaje de error en la pantalla |
| Overpass / OSM | Comunitaria | Lugares en `/ciudad` | ODbL | Bajo demanda | — | Límite de uso justo | Gratis | Mensaje de error |
| Semilla curada `curaduria-tp`, `estimacion-tp` | Estimación / histórico | Precios, conectividad, temporada, costos | Interna, **sintética** | **Vencida** (confianza 54 %) | 0,75 | Sin precios reales | — | — |
| Amadeus | Proveedor externo | (Previsto) vuelos | Comercial | — | 0,9 | **Requiere clave: no conectada** | De pago/clave | Sigue la semilla |

## Decisiones
- **Wikipedia (pageviews) excluida:** exige títulos de artículo que no puedo verificar por destino.
- **Precios de vuelo:** no existe fuente abierta sin clave; siguen siendo estimaciones etiquetadas y vencidas.
- **Sin Supabase:** todo queda local y en memoria; las fuentes se cachean en el proceso del servidor.

## Cómo se trata el dato
- `observedAt` del riesgo vivo = día de **nuestra consulta**; la fecha del aviso original se muestra aparte.
- El nivel se deriva de `details.alert_status` del FCDO: sin alerta = 1; «evitar no esenciales / todo viaje a zonas» = 2; «evitar no esenciales a todo el país» = 3; «evitar todo viaje a todo el país» = 4 (el motor excluye el 4). Valores no reconocidos → no se publica nivel.
- **Observado vs inferido:** los valores `*_to_parts` y `avoid_all_but_essential_travel_to_parts` se vieron en respuestas reales; los `*_whole_country` se infirieron por simetría y están cubiertos por pruebas, no por una respuesta real.

## Variables de entorno
`LIVE_SOURCES=0` desactiva las fuentes vivas · `TP_FCDO_BASE` / `TP_USGS_BASE` apuntan a otro servidor (pruebas, `qa/mock-sources.js`).
