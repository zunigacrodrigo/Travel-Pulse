# PRD — «Mi día en la ciudad» (caso norte: São Paulo, jueves)

Responsable: CPO (Agent 02) · Revisión: CEO (01), CTO (07), Data (12), Trust (13), QA (15). Estado: en construcción.

## 1. El caso norte
> Salgo el miércoles en la noche y llego a São Paulo el jueves a las 11:00. Tengo todo el jueves. Quiero un restaurante, una galería, un museo y, más tarde, un pub. Quiero un itinerario que pueda ver en un mapa. ¿Esos lugares estarán abiertos? ¿Hay fila? ¿El precio es el que dicen? Si empieza a llover, ¿qué hay cerca y bajo techo? Si se me antoja un pub, ¿cuál queda cerca y abierto?

**Por qué esto no es lo que hace un chat:** un chat entrega un itinerario de texto que queda ahí. Travel Pulse debe entregar un itinerario **vivo**: con datos reales de horarios, clima por hora y traslados, con señales de otros viajeros, y que se **recalcula** cuando cambia algo.

## 2. Qué datos son reales y cuáles no (verificado el 1-nov-2026)
| Dato | Fuente | Estado |
|---|---|---|
| Lugares (museos, galerías, restaurantes, pubs) con coordenadas | OpenStreetMap vía Nominatim | ✅ responde. Overpass **no** responde desde el entorno de desarrollo |
| Horario de apertura | Etiqueta `opening_hours` de OSM | ⚠️ museos ~50 %; restaurantes y pubs ~15 %. **Si falta, se dice «horario sin confirmar»; nunca se supone abierto** |
| Pronóstico por hora (lluvia, temperatura) | Open-Meteo | ✅ |
| Tiempos de traslado a pie | OSRM (OpenStreetMap) | ✅ servidor de demostración; en producción hay que alojarlo o acordar uso |
| Aviso oficial de viaje del país | FCDO | ✅ |
| Fila, precio pagado, «está bueno», «cerró» | **Viajeros (PulseMesh)** | ✅ base lista; **vacío hasta que haya reportes** |
| Precio de entrada | Etiqueta `fee`/`charge` de OSM, casi nunca | ❌ sin fuente confiable |

## 3. Historias y criterios de aceptación
1. **Armar mi día.** Indico ciudad, fecha, hora de llegada, hasta qué hora y qué quiero (museo, galería, restaurante, pub). Recibo un itinerario con hora de inicio y fin de cada actividad.
   *Aceptación:* ningún lugar se programa fuera de su horario conocido; si el horario es desconocido, la tarjeta lo dice y no se presenta como confirmado; los traslados son tiempos reales a pie; los supuestos de duración se muestran y se pueden cambiar.
2. **Verlo.** Itinerario, mapa y panel de contexto a la vez en escritorio.
   *Aceptación:* sin columnas de móvil en un lienzo vacío; en móvil se apila sin desbordar.
3. **Saber si estará abierto.** Cada lugar muestra «abierto hasta las 20:00», «cerrado a esa hora» o «horario sin confirmar».
4. **Aprovechar a las personas.** Cada lugar y la zona muestran reportes de viajeros (fila, precio, estado) con su antigüedad y cuántas personas los corroboran.
   *Aceptación:* sin reportes, dice «todavía no hay reportes»; **jamás se inventan**.
5. **Si llueve.** El día muestra la probabilidad de lluvia por hora. Al activar «está lloviendo», las actividades al aire libre se reemplazan por alternativas **bajo techo, abiertas y cercanas**, y se explica el cambio. Nada se cambia sin mi aprobación.
6. **Quiero un pub.** Agrega el pub más cercano que esté abierto a esa hora (o dice que no hay confirmado).
7. **Se guarda y se deshace.** Reutiliza el historial de Trip Twin.

## 4. Fuera de alcance de esta entrega (se dice, no se esconde)
- Precios de entradas y comidas (sin fuente real).
- Reservas.
- Eventos de la Fórmula 1 (sin fuente conectada).
- Disponibilidad en tiempo real (aforo, cupos): solo lo que reporten las personas.

## 5. Equipo y entregables
| Rol | Entregable de esta entrega |
|---|---|
| CPO (02) | Este documento y criterios de aceptación |
| Data Intelligence (12) | Fuentes verificadas (tabla de arriba), fixtures reales, política «sin dato» |
| Trust & Safety (13) | Nada de reportes inventados; reportes de viajeros siempre rotulados como no oficiales |
| CDO (05) / UX (06) | Pantalla de escritorio de tres paneles (plan · mapa · contexto) |
| CTO (07) / Backend (09) | Módulos `src/lib/day/*` y `/api/day-plan` |
| Frontend (08) | Pantalla `/dia` |
| Decision Intelligence (11) | Planificador con horarios, clima y traslados; reemplazos por lluvia |
| QA (15) / Red Team (16) | Pruebas con datos reales, casos límite (horario ausente, lluvia, sin conexión) y capturas |

## 6. Definition of Done
Implementado, con errores y estados vacíos, responsive, probado con datos reales grabados, capturas de móvil y escritorio, sin datos sintéticos y con documentación.
