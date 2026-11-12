// Regla del dueño: solo datos reales. Sin viaje propio, Mi viaje no muestra ejemplos; un guardado antiguo con
// datos de ejemplo se descarta. Servidor: ver scripts/e2e.mjs.   Ejecutar: node qa/e2e-sin-demo.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:3102';
const BANNED = /demostraci|sint[eé]tic|\bdemo\b|Fórmula 1|Ibirapuera|Mocotó|Museo del Fútbol|Idea de ejemplo/i;
const results = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await step(`[${w}] sin viaje: estado vacío honesto con salidas reales`, async () => {
      await p.goto(BASE + '/trip-twin');
      await p.getByRole('heading', { name: 'Todavía no tienes un viaje guardado' }).waitFor();
      assert.ok(await p.getByRole('link', { name: 'Armar mi día' }).isVisible());
      assert.ok(await p.getByRole('link', { name: 'Traer un plan que ya tengo' }).isVisible());
      assert.equal(await p.locator('.tt-timeline-item').count(), 0);
      assert.doesNotMatch(await p.locator('body').innerText(), BANNED);
    });
    await step(`[${w}] un guardado antiguo con datos de ejemplo se descarta`, async () => {
      await p.evaluate(() => {
        const ev = { status: 'estimated', sourceId: 'synthetic-demo-data', observedAt: '2026-10-27T12:00:00-03:00', expiresAt: null };
        const trip = { id: 'sao-paulo-demo', destination: 'São Paulo, Brasil', startAt: '2026-11-04T09:00:00-03:00', endAt: '2026-11-04T18:00:00-03:00', timeZone: 'America/Sao_Paulo', budget: { amount: 150, currency: 'USD' }, travelers: 2 };
        const act = { id: 'cultural-walk', name: 'Paseo cultural', location: { latitude: -23.56, longitude: -46.65 }, durationMinutes: 75, importance: 'high', cost: { amount: 8, currency: 'USD', basis: 'per_person' }, travelMinutesFromPrevious: 0, travelEvidence: ev, hoursEvidence: ev, costEvidence: ev, demoData: true };
        localStorage.setItem('travel-pulse.trip-twin.v1', JSON.stringify({ trip, activities: [act], plan: {} }));
      });
      await p.reload();
      await p.getByRole('heading', { name: 'Todavía no tienes un viaje guardado' }).waitFor();
      assert.equal(await p.locator('.tt-timeline-item').count(), 0);
    });
    await step(`[${w}] sin desbordamiento horizontal`, async () => {
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    });
    await ctx.close();
  }
  await browser.close();
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
