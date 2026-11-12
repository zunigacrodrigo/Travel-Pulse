// E2E de deshacer/rehacer/historial de Trip Twin (Playwright, Chromium).
// Servidor: cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
//   PORT=3102 HOSTNAME=127.0.0.1 RATE_LIMIT_DISABLED=1 node .next/standalone/server.js
// Ejecutar: node qa/e2e-trip-twin-undo.js
const { chromium } = require('playwright');
const { seedPlan } = require('./seed-plan');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:3102';
const OUT = '/tmp/claude-0/qa/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL', timezoneId: 'America/Santiago' });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${w}] ${m.text().slice(0, 200)}`); });
    p.on('pageerror', (e) => errors.push(`[${w}] pageerror ${e.message.slice(0, 200)}`));
    const count = () => p.locator('.tt-timeline-item').count();
    await seedPlan(p, BASE);
    const initial = await count();
    await step(`[${w}] deshacer y rehacer deshabilitados al inicio`, async () => {
      assert.equal(await p.getByRole('button', { name: 'Deshacer último cambio' }).isDisabled(), true);
      assert.equal(await p.getByRole('button', { name: 'Rehacer cambio' }).isDisabled(), true);
    });
    await step(`[${w}] cancelar una actividad y deshacerla`, async () => {
      await p.locator('.tt-replan-controls button:has-text("Cancelar actividad")').first().click();
      assert.equal(await count(), initial - 1);
      await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
      assert.equal(await count(), initial);
      assert.equal(await p.getByRole('button', { name: 'Rehacer cambio' }).isDisabled(), false);
    });
    await step(`[${w}] rehacer vuelve a cancelar`, async () => {
      await p.getByRole('button', { name: 'Rehacer cambio' }).click();
      assert.equal(await count(), initial - 1);
    });
    await step(`[${w}] el historial lista el cambio y sobrevive a recargar`, async () => {
      await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
      await p.locator('.tt-replan-controls button:has-text("Cancelar actividad")').first().click();
      await p.reload(); await p.waitForSelector('.tt-timeline-item');
      assert.ok(await p.locator('.tt-history-list li').count() >= 1);
      assert.equal(await p.getByRole('button', { name: 'Deshacer último cambio' }).isDisabled(), false);
      await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
      assert.equal(await count(), initial);
    });
    await step(`[${w}] reordenar se deshace`, async () => {
      const first = await p.locator('.tt-timeline-detail b').first().textContent();
      await p.getByRole('button', { name: /hacia abajo/ }).first().click();
      assert.notEqual(await p.locator('.tt-timeline-detail b').first().textContent(), first);
      await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
      assert.equal(await p.locator('.tt-timeline-detail b').first().textContent(), first);
    });
    await step(`[${w}] historial corrupto en localStorage no rompe la página`, async () => {
      await p.evaluate(() => localStorage.setItem('travel-pulse.trip-twin.history.v1', '{"past":[{"x":1}]'));
      await p.reload(); await p.waitForSelector('.tt-timeline-item');
      assert.equal(await p.getByRole('button', { name: 'Deshacer último cambio' }).isDisabled(), true);
    });
    await step(`[${w}] sin desbordamiento horizontal`, async () => {
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    });
    await p.locator('#tt-replan').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/trip-twin-undo-${w}.png` });
    await ctx.close();
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const failed = results.filter(([s]) => s === 'FAIL').length;
  console.log(`${results.length - failed}/${results.length}`);
  process.exit(failed ? 1 : 0);
})();
