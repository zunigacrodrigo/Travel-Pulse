# Travel Pulse — Blueprint de producto y compañía

Síntesis de toda la conversación (Prompt Maestro 2.0, tus pruebas del producto, el caso del itinerario de la F1 en São Paulo, las auditorías de ChatGPT, la propuesta «Living Trip», las fuentes sondeadas y la investigación de competencia). Fecha: 16-nov-2026.

**Honestidad previa.** «Unicornio» (valoración ≥ USD 1.000 M) no es una función ni se diseña: es un resultado raro que exige producto, distribución, datos propios y una industria que pague. Este documento define la **tesis**, las condiciones que tendrían que cumplirse y cómo saber pronto si no se cumplen. No contiene cifras de mercado porque no las he investigado y no las voy a inventar. Los «departamentos» de abajo son lentes de análisis míos, **no estudios independientes**; ningún viajero ajeno a ti ha usado el producto.

---

## 1. La idea que lo ordena todo

Tu queja original, la que dio origen al proyecto: *«la IA me da varias opciones pero no me direcciona».* Esa es la oportunidad.

> **Travel Pulse no te da diez opciones. Te dice qué hacer ahora, por qué, cómo llegar, y se corrige solo cuando el mundo cambia. Tú decides; nada se aplica sin tu aprobación.**

Frase de producto: **«Una decisión, no diez opciones — y un plan B ya listo.»**

Tres cosas lo hacen distinto de un chat con IA:
1. **Decide con evidencia, no con texto plausible.** Cada dato (horario, traslado, aire, aviso de otro viajero) trae fuente, fecha, vigencia y confianza. Lo desconocido se muestra como desconocido.
2. **El plan es una hipótesis viva.** Cuando una evidencia cambia (lluvia, cierre, 3 viajeros reportan algo), se recalcula solo lo afectado y se explica qué cambia y qué se mantiene.
3. **La calidad vive en un motor, no en el modelo de lenguaje.** Esto no es una preferencia: en TravelPlanner (ICML 2024) GPT-4-Turbo cumplió todas las restricciones en el 0,6 % de los planes. Con un modelo gratuito como orquestador, el motor determinista es obligatorio.

## 2. El bucle completo (el producto es esto, no una pantalla)

```
ENTENDER → DECIDIR → GUIAR → ADAPTAR → APRENDER ─┐
   ▲                                              │
   └──────────── (preferencias y estimaciones) ◄──┘
```

| Etapa | Qué recibe el viajero | Estado hoy |
|---|---|---|
| **Entender** | Dice su intención con sus palabras («hoy quiero tranquilidad y comer bien»); el sistema usa su DNA declarado | Parcial: Director v1 y DNA; falta la intención del día como motor |
| **Decidir** | Un día con forma (barrio, ritmo, un momento memorable) y la razón de cada parada | **Débil**: hoy ordena por completitud de datos, no por calidad ni encaje |
| **Guiar** | Cómo llegar entre paradas (metro/bus/pie) y qué hacer en cada lugar | **Falta**: sin tránsito; Transitous cubre Santiago y São Paulo (probado) |
| **Adaptar** | Aviso + propuesta cuando algo cambia, con deshacer | **Lo más avanzado**: revisión con horarios, lluvia, aire, UV, feriados, viajeros |
| **Aprender** | «Esperado vs ocurrido» mejora duraciones y confianza | No existe; requiere usuarios |

## 3. Arquitectura: orquestar «millones de fuentes» sin perder la verdad

El error a evitar es «conectar APIs». El diferencial es un **tejido de datos con procedencia**:

1. **Registro de fuentes.** Cada conector declara: dominio (horarios, tránsito, clima…), cobertura geográfica, frescura, licencia y si permite uso comercial, límite de peticiones, **nivel de fiabilidad** (oficial / ciencia ciudadana / comunidad / estimado) y estado de salud. Hoy hay ~12 conectores sueltos; deben ser entradas de este registro.
2. **Perfil de conocimiento por ciudad** («Global Data Discovery»). Al elegir un destino, el sistema sondea qué fuentes cubren esa ciudad (como hicimos a mano con `scripts/probe-fuentes.mjs`) y produce un mapa de **qué sabe y qué no**. Así se puede abrir cualquier destino con degradación honesta, no solo cuatro ciudades.
3. **Motor único** (un modelo de viaje, un motor): candidatos → puntaje explicable → armado con traslados → validación → replanificación. Base teórica conocida: *Orienteering Problem con ventanas de tiempo e incertidumbre* (Verbeeck et al., EJOR 2016). No se inventa el algoritmo.
4. **Planificar con incertidumbre**: un dato débil sube el riesgo → colchón de tiempo + alternativa de respaldo ya verificada.
5. **Orquestador LLM (gratuito)**, acotado: traduce la frase a parámetros cerrados, **elige entre las herramientas del registro** y redacta la explicación sobre hechos que el motor le entrega. Si falla, el plan no cambia.
6. **Capa de experiencia**: tarjetas con foto con licencia, «por qué ir» tomado de texto real, duración, mejor momento, lo práctico y qué hay alrededor.
7. **Bucle de aprendizaje** con consentimiento explícito y borrado.

## 4. Lo que el viajero debe vivir (el foco, sobre todo lo demás)

- Un día que **tiene forma**: una zona, un tema, un ritmo; no puntos dispersos.
- Un **momento memorable** por día y tiempo para comer y respirar.
- **Ánimo del día** (tranquilo / comer bien / descubrir / aventura). «Descubrir» prioriza lo menos conocido → rompe el problema de ver siempre los mismos lugares.
- **Tarjeta por lugar**: foto real, por qué ir, qué hacer, cuánto tiempo, cuándo ir, entrada y accesibilidad, cómo llegar, qué hay cerca.
- **Plan B por parada**, ya pensado.
- Honestidad visible: «sin confirmar» donde corresponde.

**Límite que hay que decir:** el «alma» de un lugar pequeño no la dan las APIs abiertas, y no hay reseñas ni precios abiertos. Hace falta una **capa editorial propia** (~30 experiencias por ciudad, cada una con fuente). Los borradores pueden prepararse desde fuentes reales y marcarse «pendiente de revisión humana»; certificar que algo «vale la pena» requiere criterio humano.

## 5. Los «departamentos» (lentes de análisis)

| Lente | Qué exigiría | Riesgo principal |
|---|---|---|
| **CEO** | Una cuña concreta y una métrica norte | Intentar abarcar el mundo antes de ser excelente en un lugar |
| **CPO** | «Una decisión, no diez opciones»; ánimo del día; plan B | Que el primer plan que recibe el viajero sea pobre (hoy lo es) |
| **CTO** | Un modelo de viaje, un motor; registro de fuentes; pruebas de propiedad | Dos motores y dos sistemas de señales siguen conviviendo |
| **Datos** | Procedencia, vigencia, licencias | Dependencia de APIs gratuitas con límites (ya vimos 429 de Wikivoyage/Wikidata) |
| **IA** | Modelo gratuito solo como intérprete/redactor; medición real | La IA nunca se midió contra la API real; modelos gratuitos alucinan más |
| **UX** | Tarjetas ricas, un solo flujo, estados honestos | Apariencia técnica sin experiencia (la estética oscura no basta) |
| **QA/Seguridad** | E2E, pruebas de propiedad, RLS verificado | Ya hay buena base; falta prueba en producción con usuarios |
| **Legal/Privacidad** | Licencias (OSM ODbL, CC BY-SA de Wikivoyage, Open-Meteo gratis = **no comercial**), consentimiento | Monetizar con fuentes cuya licencia no lo permite |
| **Negocio** | Quién paga y por qué | Sin demanda demostrada |

## 6. Cuña de entrada (hipótesis, no hecho)

Candidatas, de mayor a menor apoyo en lo conversado:
1. **Viajes a grandes eventos** (el caso de la F1 en São Paulo que originó el proyecto): tiempo concentrado, logística exigente (transporte colapsado, cierres, cambios), alta disposición a pagar. Hipótesis: *aquí «una decisión + plan B» vale más que en un viaje relajado.*
2. **Chile como ciudad-laboratorio** (Santiago, Valparaíso): tienes contexto local y puedes probarlo tú mismo; pero Valparaíso/Antofagasta no tienen tránsito en Transitous.
3. **Viajeros locales explorando su propia ciudad**: frecuencia alta, pero valor de pago incierto.

Decisión pendiente tuya: cuál de las tres validar primero.

## 7. Modelo de negocio (opciones; ninguna validada)

- **Consumidor:** gratis con valor claro; de pago por funciones de acompañamiento en viaje (adaptación en vivo, offline).
- **Comisión por acción** (entradas, traslados, tours) **solo después** de que la recomendación sea confiable; mezclar comisión con recomendación temprano destruye la confianza.
- **B2B / API:** el motor de itinerarios adaptativos con evidencia como servicio para oficinas de turismo, hoteles y organizadores de eventos. Es plausible que sea el negocio más sólido que el consumidor puro; no está validado.
- **Ventaja de costo (estructural, real):** motor determinista + modelo gratuito = costo por usuario muy bajo frente a productos que dependen de LLM de pago para planificar.

## 8. Foso defensivo (honesto)

- **Copiable:** buscar lugares, un chat, un itinerario con IA. Google puede añadirlo a Maps.
- **Difícil de copiar, y solo con el tiempo:** (a) la base **esperado vs ocurrido** (duraciones y traslados reales), (b) la capa de realidad local (reportes corroborados), (c) el motor con procedencia y planificación bajo incertidumbre, (d) relaciones locales (editorial, oficinas de turismo).
- **Mientras no haya usuarios, el foso es cero.** Es un activo que se construye, no se declara.

## 9. Hoja de ruta con puertas de decisión

| Fase | Se construye | Puerta para pasar a la siguiente |
|---|---|---|
| **A. Un día extraordinario** (Santiago) | Motor único con puntaje explicable y variedad; tarjetas con alma; tránsito por Transitous; plan B por parada; Director con modelo gratuito | **5 viajeros reales** reciben un día y ≥ 4 dicen «lo haría». Tests de propiedad pasan (sin solapes, sin traslado desconocido en 0). Variedad medida |
| **B. Adaptación creíble** | Replanificación por lluvia/cierre con comprobación de apertura y cercanía; reportes en la parada | Un caso real de «cambió algo y el plan lo salvó» documentado |
| **C. Piloto en cuña** (evento o Chile) | Registro de fuentes y perfil de conocimiento por ciudad | Uso repetido sin ti presente; métrica norte medible |
| **D. Aprender** | «Esperado vs ocurrido», Travel Memory con consentimiento | Estimaciones mejoran frente a las base |
| **E. Escalar** | Más ciudades vía perfil de conocimiento; B2B | Solo si A–C se cumplen |

**Criterio de parada:** si en la fase A los viajeros reales no ven una diferencia clara frente a un chat de IA, **no se escala**: se corrige el producto o se reconsidera la tesis.

## 10. Métricas

- **Norte:** % de cambios recomendados que el viajero acepta y que mejoran su experiencia.
- Plan ejecutado sin fricción (paradas realmente visitadas / planeadas).
- Minutos recuperados frente al itinerario original; problemas evitados (cierres, traslados inviables).
- Confianza declarada («la información fue correcta») y retención en un segundo viaje.
- Técnicas: tasa de cumplimiento de restricciones (estilo TravelPlanner), variedad entre intenciones, costo por plan.

## 11. Inventario honesto: qué tenemos y qué no

**Tenemos (verificado):** validación de plan con deshacer; contexto del día (feriado, aire, UV) con fuente; guía (Wikivoyage), patrimonio (Wikidata) y aves (GBIF); PulseMesh por lugar con RLS (probado en base local y chequeado contra tu Supabase real); Director v1 con guardas y banco de medición; despliegue en Vercel; 772 pruebas y 31 E2E.

**No tenemos:** transporte público; un criterio de calidad real para elegir lugares; tarjetas con alma; ánimo del día; variedad; motor único; eventos, precios, afluencia, accesibilidad; modelo gratuito conectado; usuarios; medición de la IA con la API real; el catálogo `seed.sql` cargado en tu Supabase.

## 12. Lo que sigue (orden)

1. Motor único con puntaje explicable + variedad, **Santiago**.
2. Tránsito con **Transitous** (Santiago, São Paulo; las otras dos declaran «sin cobertura»).
3. Tarjetas de lugar con alma y plan B por parada.
4. Adaptador para modelo gratuito (OpenAI-compatible) y Director sobre el motor.
5. Prueba con 5 viajeros reales y medición externa (comprobaciones tipo TravelPlanner/TripTide).

## 13. Fuentes de la investigación
TravelPlanner https://arxiv.org/pdf/2402.01622 · TravelBench https://arxiv.org/html/2512.22673v1 · TripTide https://arxiv.org/html/2510.21329v1 · Orienteering (revisión 2025) https://arxiv.org/pdf/2512.16865 · Transitous https://transitous.org/doc/ · MOTIS https://github.com/motis-project/motis · TripIt Pro https://www.tripit.com/web/blog/news-culture/tripit-pro-risk-alerts · comparativas de planificadores (de terceros y de fabricantes, sesgadas) https://dupple.com/learn/best-ai-for-trip-planning y https://layla.ai/it/blog/news-and-tips/ai-travel-planners-comparison

Ver también: `docs/COMPETENCIA_Y_EVIDENCIA.md`, `docs/COBERTURA_FUENTES_NUEVAS.md`, `docs/DIRECTOR_IA.md`, `docs/CONFIGURAR_NUBE.md`.
