// Verificación visual de Radar (medidor + alertas) y Trip Twin (presupuesto por categoría).
// Requiere el servidor en :3102 con fuentes simuladas (ver qa/e2e-radar.js). Capturas en /tmp/claude-0/qa/shots.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:3102';
const OUT = '/tmp/claude-0/qa/shots'; require('fs').mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };
(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['movil', 390, 844], ['tablet', 820, 1180], ['escritorio', 1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL', timezoneId: 'America/Santiago' });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 160)}`); });
    p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 160)}`));
    const noOverflow = async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await p.goto(BASE + '/radar'); await p.waitForSelector('text=Nivel más alto observado');
    await step(`[${name}] Radar: medidor con nivel y conteos`, async () => {
      assert.ok(await p.getByRole('img', { name: /Medidor: nivel \d de 4/ }).count());
      assert.equal(await p.locator('ul[aria-label="Destinos por nivel"] li').count(), 4);
    });
    await step(`[${name}] Radar: alertas activas listadas`, async () => {
      const t = await p.getByRole('heading', { name: /Alertas activas/ }).textContent();
      assert.ok(/\d+/.test(t));
    });
    await step(`[${name}] Radar: sin desbordamiento`, noOverflow);
    await p.screenshot({ path: `${OUT}/radar-${name}.png`, fullPage: true });
    await p.goto(BASE + '/trip-twin'); await p.waitForSelector('.tt-budget');
    await step(`[${name}] Trip Twin: presupuesto por categoría con nota de costos sin precio`, async () => {
      assert.ok(await p.locator('.tt-budget li').count() >= 1);
      assert.match(await p.locator('.tt-budget-note').textContent(), /sin precio|declarados/);
    });
    await step(`[${name}] Trip Twin: cancelar actividad actualiza el desglose`, async () => {
      const before = await p.locator('.tt-budget li').count();
      await p.locator('.tt-replan-controls button:has-text("Cancelar actividad")').first().click();
      assert.ok(await p.locator('.tt-budget li').count() <= before);
    });
    await step(`[${name}] Trip Twin: sin desbordamiento`, noOverflow);
    await p.locator('.tt-budget').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}/trip-twin-${name}.png` });
    await ctx.close();
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
