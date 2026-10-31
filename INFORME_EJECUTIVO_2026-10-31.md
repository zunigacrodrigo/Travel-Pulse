# Informe ejecutivo — Travel Pulse 0.3.0 (31 de octubre de 2026)

## 1. Estado general

La base técnica está sana. Se añadieron **Travel DNA**, **Travel What-If** y, en esta versión, **fuentes oficiales en vivo** (avisos de viaje FCDO y sismos USGS) con un **Radar**. Todo sigue local, sin Supabase. El producto **no está terminado**: los gates C (datos y confianza) y D (producción) siguen abiertos y B (experiencia) está parcial. Detalle en `docs/MATRIZ_CUMPLIMIENTO.md`.

## 2. Qué se hizo

| Paso | Resultado |
|---|---|
| Auditoría (Fase 0) | Repo público (`fa2a030`) + parche del 28-oct aplicado sin conflictos. El resultado es **idéntico, archivo por archivo, al zip adjunto** (salvo archivos generados como `tsconfig.tsbuildinfo`) |
| Matriz de cumplimiento | 20 módulos contra el código real, en `docs/MATRIZ_CUMPLIMIENTO.md` |
| Travel DNA (módulo 8) | Implementado y verificado, solo local |
| Travel What-If (módulo 13) | Implementado y verificado, a nivel destino |
| Corrección a la auditoría previa | La auditoría del 28-oct decía "Pulse Index: no existe". Es inexacto: el score de 8 factores con confianza cumple esa función; lo que falta es el nombre y el índice de oportunidad como número |

## 3. Funcionalidades realmente implementadas

**Fuentes en vivo y Radar** (`/radar`, `/api/radar`; detalle en `docs/CATALOGO_FUENTES.md`)
- Avisos de viaje del FCDO (Reino Unido) para los 14 países de la base → alimentan el factor «riesgo» con fuente y fecha de consulta. Sismos M4,5+ del USGS por destino (informativo, no entran al puntaje).
- Cada dato dice de dónde viene y cuándo se consultó. Si la fuente falla: conserva el último dato bueno y lo marca «desactualizada»; sin ninguno, usa la base y la rotula «no se pudo verificar en vivo». Nunca bloquea el ranking.
- **Límite importante:** desde este entorno no hay acceso a GOV.UK ni USGS. La integración se verificó con un servidor falso de la **misma forma** (forma confirmada en documentación y lecturas reales de dos países). No está probada contra los servicios reales: pruébala en tu equipo o en producción.
- Efecto medible: la confianza de Cusco pasa de 54 % a 56 % porque el riesgo deja de figurar como dato antiguo.

**Travel DNA** (`/perfil`)
- Preferencias explícitas: salida, presupuesto, días, viajeros, fechas flexibles, intereses, ritmo.
- Se guarda solo en el dispositivo (clave `tp-dna`). Editar, exportar a JSON, importar (con validación), borrar con confirmación (elimina también la clave).
- No infiere nada. Las sugerencias desde viajes guardados aparecen aparte y el viajero decide si las agrega.
- En el inicio, botón «Usar mi Travel DNA» precarga el formulario. Pestaña «Mi DNA» en la navegación.
- El **ritmo** se guarda pero todavía no influye en nada; la pantalla lo dice.

**Travel What-If** (panel «¿Y si cambio algo?» en la ficha de cada destino)
- Cambia días, viajeros, mes, presupuesto o fechas flexibles y compara contra tu plan: costo total, vuelo, estadía, score, confianza y factores que se mueven.
- Lo calcula el servidor con el **mismo motor** que puntúa los destinos (`src/lib/engine/whatif.ts`, `POST /api/what-if`). El veredicto es texto determinista: sin IA, sin cifras inventadas. Si falta un dato, la diferencia es "—" y el texto lo dice.
- Marca cuando el escenario supera el 110 % del presupuesto (el mismo filtro duro del ranking).

## 4. Cambios visuales

Pantalla `/perfil` y panel What-If, ambos con los componentes y tokens existentes. Quinta pestaña en la barra inferior (ancho mínimo de 72 a 64 px para que quepa en 390 px). Capturas en `docs/evidence/`.

## 5. Resultados de QA (ejecutados y observados)

| Prueba | Resultado |
|---|---|
| `npm ci` en limpio | OK |
| `tsc --noEmit` | 0 errores |
| Vitest | **283 pasan** (221 previas + 13 What-If + 14 DNA + 35 fuentes) |
| `next build` | OK, rutas `/perfil` y `/api/what-if` incluidas |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| ESLint | 0 errores, 16 avisos (misma cifra que antes de mis cambios; ninguno en archivos nuevos) |
| API `/api/what-if`, 9 caminos | 200 válido, 422 sin cambios, 404 destino inexistente, 400 ×4 (id, campo extra, rango, JSON roto), cambio de mes |
| E2E Radar (`qa/e2e-radar.js`, con `qa/mock-sources.js`) | **11/11**: estado de fuentes, mapa accesible, Cusco con aviso y sismo, sin conexión, error del servidor con reintento, móvil y escritorio |
| E2E Chromium (`qa/e2e-dna-whatif.js`) | **19/19**, sin errores de consola. Móvil 390 px y escritorio 1280 px, sin desbordes |
| Error de servidor simulado en What-If | Mensaje accesible (`role=alert`), la página sigue usable |
| Hidratación #418 | Revisé `/trip-twin`, `/importar`, `/ciudad` e inicio en producción con 3 zonas horarias y locales: **no se reprodujo** |

## 6. Pendiente y errores conocidos

| Ítem | Estado |
|---|---|
| **Datos semilla vencidos** | Todos los destinos salen con confianza **54 %** y el aviso "datos antiguos en precio, conectividad, riesgo y tendencia". El motor lo declara bien; el problema es el dato |
| Error React #418 en `/trip-twin` | No reproducido aquí; no lo toqué. Puede depender de datos guardados en tu navegador |
| 16 avisos de React 19 | Preexistentes (efectos con `setState`). No bloquean |
| Comparador | Probado por API; la interfaz `/comparar` no la probé en navegador |
| Trip Twin | Sin deshacer ni historial en pantalla; traslados "sin datos"; datos sintéticos |
| Cuentas y servidor | No existe autenticación; DNA, guardados y señales viven solo en el dispositivo |
| Clima y lugares en vivo | No pude probar Open-Meteo ni Overpass (sin acceso desde este entorno) |
| Fidelidad visual | **Parcial**: el Radar sigue el lenguaje de las 12 referencias (mapa oscuro, niveles, tarjetas) sin copiarlas; faltan medidor TRSS, fotos y chat |
| Fuentes reales | **No verificadas desde aquí** (ver arriba) |
| Aviso FCDO | Postura de un solo gobierno; los valores «país completo» se infirieron (cubiertos por pruebas) |

## 7. Riesgos

- Mostrar recomendaciones con confianza 54 % uniforme puede parecer un fallo del producto aunque sea honestidad del motor.
- Todo lo personal es local: si el usuario limpia el navegador, pierde su perfil. Es una limitación de diseño hasta que existan cuentas.
- Las pruebas E2E dependen de Playwright, que no es dependencia del proyecto (ver decisión 4).

## 8. Próximas prioridades

| # | Qué | Necesito de ti |
|---|---|---|
| 1 | Refrescar los datos: curar la semilla o conectar una fuente de precios | **Decisión y credenciales** (p. ej. Amadeus) o que me digas que curemos a mano |
| 2 | Cuentas y persistencia — **sin Supabase por tu decisión**; si quieres sincronizar entre dispositivos habrá que elegir otra opción | Tu decisión |
| 3 | Cerrar el ciclo destino → Trip Twin (itinerario desde la ficha) | Nada |
| 4 | Probar la UI del comparador y subirlo a 2–4 destinos | Nada |
| 5 | Subir a GitHub: la conexión rechazó el permiso de escritura | **Instalar la app de GitHub con acceso al repo** o aplicar el parche entregado |
| 6 | Reproducir el #418 | Qué viaje tenías importado cuando ocurre |

## 9. Versión generada

**0.3.0**. Nuevos en esta versión: `src/lib/sources/*` (+35 pruebas), `src/app/api/radar`, `src/components/screens/RadarView.tsx`, `src/app/radar`, `qa/e2e-radar.js`, `qa/mock-sources.js`, `docs/CATALOGO_FUENTES.md`; modificados `repository.ts`, `api.ts`, `HomeView`. De la 0.2.0:  `src/lib/engine/whatif.ts` (+test), `src/app/api/what-if/route.ts`, `src/components/WhatIfPanel.tsx`, `src/lib/client/dna-core.ts` (+test), `src/lib/client/dna.ts`, `src/components/screens/DnaView.tsx`, `src/app/perfil/page.tsx`, `qa/e2e-dna-whatif.js`, `docs/MATRIZ_CUMPLIMIENTO.md`, `docs/evidence/*`. Modificados: `DestinationView`, `HomeView`, `BottomTabBar`, `Icons`, `api.ts` (cliente), `eslint.config.mjs` (excluye `qa/`), `package.json`/`package-lock.json` (versión).

## 10. Cómo probar

```
npm ci
npm run typecheck && npm run lint && npm test && npm run build
npm run dev          # o: npm run start:prod tras el build
# Radar contra servidor falso (sin internet):
node qa/mock-sources.js 4010 &
TP_FCDO_BASE=http://127.0.0.1:4010 TP_USGS_BASE=http://127.0.0.1:4010 npm run dev
```
Con internet, abre `/radar`: debería decir «al día» en ambas fuentes. Si dice «sin conexión», esa es la prueba real que me falta.
1. Abre `/perfil`, completa tus preferencias y guarda. Recarga: persiste.
2. Vuelve al inicio: pulsa «Usar mi Travel DNA».
3. Explora destinos, abre uno y baja hasta «¿Y si cambio algo?». Suma 2 días y pulsa «Simular escenario».

## Decisiones tomadas (reversibles)

1. **No reconstruir.** La base compila, pasa pruebas y tiene un motor sólido; reconstruir no tenía justificación.
2. **What-If en el servidor y sin IA.** Reutiliza el motor y garantiza que cada número sea trazable. Un LLM solo podría añadir riesgo de cifras inventadas.
3. **Travel DNA solo local.** Sin cuentas no hay forma responsable de guardarlo en servidor.
4. **Playwright fuera de `package.json`.** Descarga navegadores y sube el costo de instalación; el script queda en `qa/` y se ejecuta con Playwright global. Se puede adoptar formalmente cuando haya CI con navegador.
5. **Fuentes sin clave y sin Supabase.** Solo FCDO y USGS (abiertas, sin clave); Wikipedia excluida por no poder verificar títulos; precios de vuelo siguen como estimación porque no existe fuente abierta.
6. **El riesgo vivo manda sobre la semilla**, y la actualización corre en segundo plano para no frenar el ranking (la primera consulta tras arrancar usa la base).
7. **Un solo número de compatibilidad.** Mantengo el score actual; el "Pulse Index" será su nombre en la interfaz cuando decidas renombrarlo.
