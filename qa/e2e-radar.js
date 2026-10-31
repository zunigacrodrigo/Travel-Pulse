// E2E del Radar. Requiere dos instancias: A (con mock de fuentes) y B (sin acceso a fuentes).
// Uso: BASE_A=http://127.0.0.1:3110 BASE_B=http://127.0.0.1:3111 node qa/e2e-radar.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const A = process.env.BASE_A, B = process.env.BASE_B;
const OUT = process.env.OUT || '/tmp/claude-0/qa/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const step = async (n, fn) => { try { await fn(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };
(async () => {
  const browser = await chromium.launch();
  const mk = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL', timezoneId: 'America/Santiago' });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
    return { ctx, p };
  };
  for (const [w, h, tag] of [[390, 844, 'mobile'], [1280, 900, 'desktop']]) {
    const { ctx, p } = await mk(w, h);
    await p.goto(A + '/radar', { waitUntil: 'networkidle' });
    await step(`A[${tag}]: estado de fuentes (FCDO desactualizada por 1 país, USGS al día)`, async () => {
      await p.getByRole('heading', { name: 'Radar en vivo' }).waitFor();
      const list = p.getByRole('list', { name: 'Estado de las fuentes' });
      await list.waitFor();
      assert.match(await list.innerText(), /Avisos FCDO: desactualizada[\s\S]*1 de 14 países sin respuesta/);
      assert.match(await list.innerText(), /Sismos USGS: al día/);
    });
    await step(`A[${tag}]: mapa accesible con destinos y sismos`, async () => {
      const svg = p.getByRole('img', { name: /Mapa mundial con \d+ destinos/ });
      await svg.waitFor();
      assert.ok(await p.locator('svg g circle').count() >= 10);
    });
    await step(`A[${tag}]: Cusco muestra aviso FCDO con fecha, enlace y sismo M6,1`, async () => {
      const row = p.locator('li', { has: p.getByRole('link', { name: 'Cusco' }) });
      const t = await row.innerText();
      assert.match(t, /Precaución/); assert.match(t, /Aviso del FCDO \(Reino Unido\), consultado el \d{4}-\d{2}-\d{2}/);
      assert.match(t, /M6,1/);
      assert.equal(await row.getByRole('link', { name: 'Ver aviso original' }).getAttribute('href'), 'https://www.gov.uk/foreign-travel-advice/peru');
    });
    await step(`A[${tag}]: sin desbordamiento horizontal`, async () => {
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= w);
    });
    await p.screenshot({ path: `${OUT}/radar-${tag}.png`, fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, p } = await mk(390, 844);
    await p.goto(A + '/', { waitUntil: 'networkidle' });
    await step('Home: tarjeta «Radar en vivo» navega al Radar', async () => {
      await p.getByRole('link', { name: /Radar en vivo/ }).click();
      await p.waitForURL('**/radar');
      await p.getByRole('heading', { name: 'Radar en vivo' }).waitFor();
    });
    await ctx.close();
  }
  {
    const { ctx, p } = await mk(390, 844);
    await p.goto(B + '/radar', { waitUntil: 'networkidle' });
    await step('B: sin acceso a fuentes declara «sin conexión» y usa la base marcada como no verificada', async () => {
      const list = p.getByRole('list', { name: 'Estado de las fuentes' });
      await list.waitFor();
      const t = await list.innerText();
      assert.match(t, /Avisos FCDO: sin conexión/); assert.match(t, /Sismos USGS: sin conexión/);
      const row = p.locator('li', { has: p.getByRole('link', { name: 'Cusco' }) });
      assert.match(await row.innerText(), /no se pudo verificar en vivo/);
    });
    await p.screenshot({ path: `${OUT}/radar-sin-conexion.png`, fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, p } = await mk(390, 844);
    await p.route('**/api/radar', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"X","message":"x"}}' }));
    await p.goto(A + '/radar', { waitUntil: 'networkidle' });
    await step('Error del servidor: alerta accesible y botón Reintentar', async () => {
      await p.locator('main').getByRole('alert').waitFor();
      assert.match(await p.locator('main').getByRole('alert').innerText(), /No se pudo cargar el Radar/);
      await p.unroute('**/api/radar');
      await p.getByRole('button', { name: 'Reintentar' }).click();
      await p.getByRole('list', { name: 'Estado de las fuentes' }).waitFor();
    });
    await ctx.close();
  }
  await browser.close();
  console.log(results.map(([s, n]) => `${s}  ${n}`).join('\n'));
  console.log('\nErrores de consola inesperados:', errors.length ? '\n' + errors.join('\n') : 'ninguno');
  console.log(`\nTOTAL: ${results.filter((r) => r[0] === 'PASS').length}/${results.length}`);
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
})();
