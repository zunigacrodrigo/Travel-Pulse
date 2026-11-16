// E2E del puente Mi día → Mi viaje. La API se simula con el día REAL grabado (qa/fixtures/day-plan-real.json,
// São Paulo, jueves 5-nov-2026). Todo lo demás (navegador, almacenamiento, Trip Twin) es real.
// Servidor: ver scripts/e2e.mjs.   Ejecutar: node qa/e2e-dia-a-viaje.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3102';
const REAL = JSON.parse(fs.readFileSync(__dirname + '/fixtures/day-plan-real.json', 'utf8'));
const NOMBRES = REAL.plan.stops.map((s) => s.place.name);
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
    await ctx.route('**/api/day-plan', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REAL) }));
    const p = await ctx.newPage();
    let dialogs = 0; let aceptar = true;
    p.on('dialog', (d) => { dialogs++; aceptar ? d.accept() : d.dismiss(); });
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 180)}`); });
    p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 180)}`));
    const cuerpo = () => p.locator('body').innerText();

    await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Armar mi día' }).click();
    await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 });

    await step(`[${name}] el botón «Guardar en Mi viaje» existe cuando hay paradas`, async () => {
      assert.ok(await p.getByRole('button', { name: 'Guardar en Mi viaje' }).isEnabled());
    });
    await step(`[${name}] guardar lleva a Mi viaje con las mismas paradas, en el mismo orden`, async () => {
      await p.getByRole('button', { name: 'Guardar en Mi viaje' }).click();
      await p.waitForURL(/\/trip-twin/); await p.waitForSelector('.tt-timeline-item');
      assert.deepEqual(await p.locator('.tt-timeline-detail b').allInnerTexts(), NOMBRES);
    });
    await step(`[${name}] Mi viaje dice de dónde viene: armado en Mi día, nunca «importado»`, async () => {
      assert.equal(await p.locator('.tt-eyebrow').first().innerText(), 'TU VIAJE · ARMADO EN MI DÍA');
      assert.doesNotMatch(await cuerpo(), /importado por ti|ubicaciones son aproximadas|demostraci|sint[eé]tic/i);
    });
    await step(`[${name}] los traslados se muestran como reales y los precios como sin fuente`, async () => {
      assert.match(await p.locator('.tt-stats').innerText(), /Reales \(OSRM\)/);
      assert.match(await p.locator('.tt-stats').innerText(), /Precios no conectados/);
    });
    await step(`[${name}] cancelar y deshacer funcionan sobre el viaje guardado`, async () => {
      const n0 = await p.locator('.tt-timeline-item').count();
      await p.locator('.tt-replan-controls button:has-text("Cancelar actividad")').first().click();
      assert.equal(await p.locator('.tt-timeline-item').count(), n0 - 1);
      await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
      assert.equal(await p.locator('.tt-timeline-item').count(), n0);
    });
    await step(`[${name}] el origen y el viaje sobreviven a una modificación y a recargar`, async () => {
      await p.locator('.tt-replan-controls button:has-text("Cancelar actividad")').first().click();
      await p.reload(); await p.waitForSelector('.tt-timeline-item');
      assert.equal(await p.locator('.tt-eyebrow').first().innerText(), 'TU VIAJE · ARMADO EN MI DÍA');
      assert.equal(await p.locator('.tt-timeline-item').count(), NOMBRES.length - 1);
    });
    await step(`[${name}] si ya hay un viaje guardado, pregunta y respeta un «no»`, async () => {
      await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: 'Armar mi día' }).click();
      await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 });
      dialogs = 0; aceptar = false;
      await p.getByRole('button', { name: 'Guardar en Mi viaje' }).click();
      await p.waitForTimeout(500);
      assert.equal(dialogs, 1);
      assert.match(p.url(), /\/dia/); // no navegó
      await p.goto(`${BASE}/trip-twin`); await p.waitForSelector('.tt-timeline-item');
      assert.equal(await p.locator('.tt-timeline-item').count(), NOMBRES.length - 1); // el viaje anterior sigue intacto
    });
    await step(`[${name}] sin desbordamiento horizontal`, async () => {
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    });
    await ctx.close();
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
