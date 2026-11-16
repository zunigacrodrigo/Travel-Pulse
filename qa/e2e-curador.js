// E2E del día curado: ánimo del día, «por qué te lo propongo», transporte público y avisos de la calle.
// La respuesta de /api/day-plan es una grabación REAL de Santiago (16-nov-2026: OpenStreetMap, OSRM, Open-Meteo, lecturas de Wikipedia
// y Transitous). El aviso de la calle es la nota real de OpenStreetMap del fixture, asociada aquí a la primera parada para ejercitar la pantalla.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3102';
const REAL = JSON.parse(fs.readFileSync(__dirname + '/fixtures/day-santiago-curado.json', 'utf8'));
const first = REAL.plan.stops[0].place;
const DAY = { ...REAL, streetNotes: { [first.id]: [{ id: 1, lat: first.lat, lon: first.lon, date: '2026-09-22', text: 'están agregando semáforos aquí, no me queda claro cómo quedarán', url: 'https://www.openstreetmap.org/note/1' }] } };
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
    const bodies = [];
    await ctx.route('**/api/day-plan', (r) => { bodies.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DAY) }); });
    for (const api of ['contexto', 'guia', 'entorno']) await ctx.route(`**/api/${api}**`, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|status of 500|Error: 500/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 180)}`); });
    p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 180)}`));
    await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' });
    const clasico = p.getByRole('button', { name: /Lo imperdible/ }), descubrir = p.getByRole('button', { name: /Descubrir lo menos conocido/ });

    await step(`[${name}] el ánimo por defecto es «Lo imperdible» y se envía con el pedido`, async () => {
      assert.equal(await clasico.getAttribute('aria-pressed'), 'true');
      await p.getByRole('button', { name: 'Armar mi día' }).click();
      await p.getByRole('heading', { name: /miércoles/i }).waitFor({ timeout: 15000 });
      assert.equal(bodies.at(-1).mood, 'clasico'); assert.equal(bodies.at(-1).variant, 0);
    });
    const li = p.locator('#plan-title').locator('xpath=ancestor::section').locator('> ol > li').first();
    await step(`[${name}] cada parada dice por qué se propone, con la cifra real de interés y qué mide`, async () => {
      const why = li.getByTestId('why');
      assert.match(await why.innerText(), /Por qué te lo propongo/i);
      assert.match(await why.innerText(), /651 lecturas en Wikipedia el último mes/);
      assert.match(await why.innerText(), /no si es «bueno»/);
      assert.match(await li.innerText(), /651 lecturas este mes/);
    });
    await step(`[${name}] muestra cómo llegar en transporte público con línea, estaciones y aviso de horario programado`, async () => {
      const t = await li.getByTestId('transit').innerText();
      assert.match(t, /En transporte público · 9 min/i); assert.match(t, /L5 · \d+ min/); assert.match(t, /camina \d+ min/);
      assert.match(t, /Horario programado, no tiempo real/);
      assert.ok(await li.getByRole('link', { name: 'Transitous' }).isVisible());
    });
    await step(`[${name}] un tramo sin recorrido lo dice, sin inventar uno`, async () => {
      assert.match(await p.locator('#plan-title').locator('xpath=ancestor::section').innerText(), /Sin recorrido de transporte público para este tramo en los datos abiertos/);
    });
    await step(`[${name}] el aviso de la calle se muestra como no verificado y con enlace a su origen`, async () => {
      const n = li.getByTestId('street-notes');
      assert.match(await n.innerText(), /sin verificar/i); assert.match(await n.innerText(), /agregando semáforos/);
      assert.match(await n.getByRole('link', { name: 'OpenStreetMap' }).getAttribute('href'), /openstreetmap\.org\/note\/1/);
    });
    if (name === 'movil') { await li.scrollIntoViewIfNeeded(); await li.screenshot({ path: __dirname + '/../docs/evidence/dia-curado-movil.png' }); }
    else { await p.screenshot({ path: __dirname + '/../docs/evidence/dia-curado-escritorio.png', fullPage: true }); }
    await step(`[${name}] «Otra propuesta» pide la variante siguiente y suelta los lugares fijados`, async () => {
      await p.getByRole('button', { name: 'Otra propuesta' }).click();
      await p.getByText(/Otra propuesta: roté los lugares equivalentes/).waitFor();
      assert.equal(bodies.at(-1).variant, 1); assert.equal(bodies.at(-1).mood, 'clasico');
      assert.ok(bodies.at(-1).wishes.every((w) => !('pin' in w)));
    });
    await step(`[${name}] cambiar a «Descubrir» lo envía y reinicia la variante`, async () => {
      await descubrir.click();
      assert.equal(await descubrir.getAttribute('aria-pressed'), 'true');
      await p.getByRole('button', { name: 'Rehacer mi día' }).click();
      await p.waitForTimeout(500);
      assert.equal(bodies.at(-1).mood, 'descubrir'); assert.equal(bodies.at(-1).variant, 0);
    });
    await step(`[${name}] sin desbordamiento horizontal`, async () => { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); });
    await ctx.close();
  }
  await step('sin errores de consola', async () => assert.deepEqual(errors, []));
  await browser.close();
  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - bad}/${results.length}`); process.exit(bad ? 1 : 0);
})();
