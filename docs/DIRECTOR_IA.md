# Director de IA — v1: «Cuéntalo con tus palabras»

Primera capacidad de IA del producto. En la portada, la persona escribe una frase y el formulario de **Mi día** se rellena solo;
ella revisa y confirma. La IA **nunca arma el día** ni escribe un hecho: solo extrae datos de lo que la persona dijo.

> «Llego a São Paulo el jueves 5 de noviembre a las 11:35, quiero un museo y un pub, algo tranquilo»
> → ciudad · día · hora de llegada · tipos de lugar · ritmo.

## Cómo funciona
1. `stripPII` quita correos, teléfonos, documentos y URLs antes de enviar nada.
2. **Reglas deterministas primero** (`keywordDayIntent`): ciudad, fecha, hora, tipos de lugar y ritmo. **Lo explícito del texto manda.**
3. Solo si hay IA disponible, **Haiku 5.5** completa lo que las reglas no entendieron (`interpretDayIntent`, `src/lib/director/intent.ts`).
4. Cada dato de la IA pasa por guardas antes de usarse:
   - **Lista cerrada:** la ciudad debe ser del piloto; los tipos de lugar y el ritmo, de las listas del producto. Nada más llega al resultado.
   - **Apoyo en el texto:** toda fecha u hora que proponga la IA debe tener respaldo en lo que escribió la persona (el número, el día de la semana
     o una palabra relativa coherente como «finde»). No se inventan datos.
   - **Rango:** ni fechas pasadas ni a más de un año; la hora de término, al menos 1 h después de la llegada.
   - **Ambigüedad:** con dos ciudades en la frase, ni las reglas ni la IA eligen; lo decide la persona.
   - **La frase es un dato, no una instrucción:** va entre `<frase>…</frase>` y el sistema lo declara; la respuesta se valida con un esquema y solo pasan
     los campos conocidos.
5. El resultado dice si se entendió **con IA** o **con reglas** (la IA cuenta solo si aportó al menos un dato), qué **falta** (ciudad, fecha) y avisos honestos
   (fecha pasada, varias ciudades, ciudad no cubierta).

## Sin IA
Sin `ANTHROPIC_API_KEY`, sin presupuesto o ante un error, todo funciona con reglas y la pantalla lo dice («Modo sin IA»).

## Política de modelos y costo
- Haiku 5.5, esfuerzo bajo, máx. 220 tokens de salida, 3,5 s de límite, función «no esencial»: se corta primero si se acerca el tope de gasto.
- Cada llamada queda en la telemetría con modelo, tokens, latencia y costo estimado (`src/lib/ai/telemetry.ts`). Las tarifas son las de la lista oficial del
  SDK al 2026-11-03.
- **No medí el costo real por frase.** Se medirá con una clave real, junto con la tasa de aceptación por las guardas.

## Variables de entorno
`ANTHROPIC_API_KEY` (solo servidor), `AI_MONTHLY_BUDGET_USD` (por defecto 50). El endpoint es `POST /api/intent` (30 por hora y por IP).

## Qué está verificado y qué no
**Verificado:** 52 pruebas del intérprete y 9 del endpoint con un cliente falso; **17 mutaciones del código** que habrían dejado a la IA inventar datos,
saltarse la lista cerrada, enviar datos personales o mover el formulario sin sustento, todas detectadas; E2E de la portada (23 pasos, modo sin IA).
En el camino se encontraron y corrigieron dos errores reales: la hora que viene **después** de la fecha («el 20 de diciembre a las 11:35») no se leía,
y con dos ciudades la IA podía elegir una de las dos.

**No verificado:**
- **Nunca se ejecutó contra la API real de Anthropic.** Todo el comportamiento de la IA se probó con un cliente falso. No sé cómo responderá Haiku a frases
  reales ni qué fracción de sus respuestas aceptarán las guardas (pueden rechazar datos legítimos si el modelo los expresa de forma inesperada).
- Solo entiende **español** y **cuatro ciudades** (São Paulo, Santiago, Valparaíso y Antofagasta).
- «Mañana» se entiende como el día siguiente salvo en «por la mañana»; las reglas no cubren todas las formas de decir una fecha.
- La cantidad de viajeros no se usa todavía (Mi día no la considera).
- La zona horaria para «hoy» y «mañana» es la de Santiago.

## Cómo se mide (y qué NO se ha medido todavía)

**Banco de pruebas** (`src/lib/director/measure.ts`): 32 frases en español con la respuesta correcta escrita a mano, incluidas
frases con datos personales, intentos de inyección ("ignora tus instrucciones…"), ambiguas y casos donde sabemos que las reglas fallan.
Cada campo se califica como `correcto`, `omitido`, `equivocado` o **`INVENTADO`** (la salida trae un dato que la persona no dijo; es el error grave).
También cuenta llamadas, tokens, costo estimado, latencia p50/p95 y fugas de datos personales hacia el modelo.

**Lo que SÍ está verificado** (con clientes falsos, sin gastar dinero):
- *Modelo perfecto*: no empeora nada. *Modelo roto*: cae a reglas en las 32 frases, sin error.
- *Modelo mentiroso* (propone siempre São Paulo, 30-nov, 09:00–21:00, museo/pub/parque, ritmo intenso): **no logra colar ningún dato** que
  la frase no respalde. Este test destapó tres huecos reales que ya están cerrados: tipos de lugar y ritmo de la IA no se contrastaban con el
  texto; una hora ambigua ("a partir de las 9") se aceptaba como "hasta las 21"; y una fecha ISO absurda pegada en el texto tapaba una fecha válida posterior.
- Línea base de **solo reglas**: 24/32 frases exactas, 0 datos inventados (`docs/evidence/director-reglas.txt`).
  Debilidades conocidas: "en diez días", "la semana que viene, el miércoles", algunas horas de llegada/fin.

**Lo que NO está verificado:** nunca se ha ejecutado contra la API real de Anthropic. Desde el sandbox de desarrollo es imposible
(la herramienta de credenciales rechaza `api.anthropic.com` y una prueba con clave ficticia devuelve 401). Hasta que lo corras con tu clave,
cualquier cifra de "cuánto mejora la IA" es **desconocida**; la parte de reglas y las defensas sí están probadas.

**Cómo medirlo con tu clave** (gasta centavos, ≈32 llamadas a Haiku; el informe queda en `docs/evidence/director-live.txt`):

PowerShell (Windows):
```powershell
$env:LIVE_ANTHROPIC="1"; $env:ANTHROPIC_API_KEY="sk-ant-..."; npm.cmd run medir:director
```
bash (Mac/Linux):
```bash
LIVE_ANTHROPIC=1 ANTHROPIC_API_KEY=sk-ant-... npm run medir:director
```
La prueba falla si la IA inventa algún dato de ciudad/fecha/hora que las reglas no inventaban, o si filtra datos personales al modelo.
