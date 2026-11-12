// E2E de Travel DNA y What-If (Playwright, Chromium).
// Uso: construir (npm run build), levantar el servidor standalone en el puerto 3102 con RATE_LIMIT_DISABLED=1
//   cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
//   PORT=3102 HOSTNAME=127.0.0.1 RATE_LIMIT_DISABLED=1 node .next/standalone/server.js
// y ejecutar: node qa/e2e-dna-whatif.js   (Playwright no es dependencia del proyecto; ver docs/INFORME_EJECUTIVO_2026-10-31.md)
// Capturas en /tmp/claude-0/qa/shots.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:3102';
const OUT = '/tmp/claude-0/qa/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const q = Buffer.from(JSON.stringify({ origin: 'SCL', budgetUsd: 1500, days: 8, month: 11, flexibleDates: false, travelers: 1, interests: ['aventura'] })).toString('base64url');

const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name + ' -> ' + String(e.message).split('\n')[0]]); }
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL', timezoneId: 'America/Santiago' });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${w}] ${m.text().slice(0, 200)}`); });
    p.on('pageerror', (e) => errors.push(`[${w}] pageerror ${e.message.slice(0, 200)}`));
    return { ctx, p };
  };

  // ---------- Travel DNA (móvil 390) ----------
  let { ctx, p } = await mk(390, 844);
  await step('DNA: /perfil carga sin perfil', async () => {
    await p.goto(BASE + '/perfil', { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: 'Mi Travel DNA' }).waitFor();
    assert.ok(await p.getByText('Aún no has guardado un perfil.').isVisible());
    assert.equal(await p.getByRole('button', { name: 'Borrar mi perfil' }).count(), 0);
  });
  await step('DNA: editar, guardar y ver confirmación', async () => {
    await p.getByLabel('Presupuesto habitual (USD)').fill('2200');
    await p.getByRole('button', { name: 'Más días' }).click();
    await p.getByRole('button', { name: 'Comida' }).click();
    await p.getByRole('button', { name: 'Naturaleza' }).click();
    await p.getByRole('radio', { name: 'Tranquilo' }).click();
    await p.getByRole('button', { name: 'Guardar perfil' }).click();
    await p.getByText('Perfil guardado en este dispositivo.').waitFor();
  });
  await p.screenshot({ path: `${OUT}/dna-mobile.png`, fullPage: true });
  await step('DNA: persiste tras recargar', async () => {
    await p.reload({ waitUntil: 'networkidle' });
    assert.equal(await p.getByLabel('Presupuesto habitual (USD)').inputValue(), '2200');
    assert.equal(await p.getByRole('button', { name: 'Comida' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await p.getByRole('radio', { name: 'Tranquilo' }).getAttribute('aria-checked'), 'true');
    const raw = await p.evaluate(() => localStorage.getItem('tp-dna'));
    const d = JSON.parse(raw);
    assert.equal(d.budgetUsd, 2200); assert.equal(d.days, 9);
    assert.deepEqual(Object.keys(d).sort(), ['budgetUsd','days','flexibleDates','interests','origin','pace','travelers','updatedAt','version']);
  });
  await step('DNA: importar archivo inválido muestra error', async () => {
    await p.getByLabel('Importar perfil de Travel DNA').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hola":1}') });
    await p.getByText('Ese archivo no es un perfil de Travel DNA válido.').waitFor();
  });
  await step('DNA: exportar descarga un JSON re-importable', async () => {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar' }).click()]);
    assert.equal(dl.suggestedFilename(), 'travel-dna.json');
    const path = await dl.path();
    const txt = require('fs').readFileSync(path, 'utf8');
    assert.equal(JSON.parse(txt).budgetUsd, 2200);
    await p.getByLabel('Importar perfil de Travel DNA').setInputFiles(path);
    await p.getByText(/Perfil cargado/).waitFor();
  });
  await step('DNA: el inicio ofrece usarlo y precarga el formulario', async () => {
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Usar mi Travel DNA' }).click();
    await p.getByRole('button', { name: 'Explorar destinos recomendados' }).waitFor({ state: 'visible' });
    assert.ok(await p.getByRole('button', { name: 'Comida' }).getAttribute('aria-pressed') === 'true');
    assert.match(await p.locator('output').first().innerText(), /2\.200/);
  });
  await p.screenshot({ path: `${OUT}/home-dna-mobile.png`, fullPage: false });
  await step('DNA: borrar pide confirmación, cancela y luego borra todo', async () => {
    await p.goto(BASE + '/perfil', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Borrar mi perfil' }).click();
    await p.getByRole('button', { name: 'Cancelar' }).click();
    assert.ok(await p.evaluate(() => localStorage.getItem('tp-dna')) !== null);
    await p.getByRole('button', { name: 'Borrar mi perfil' }).click();
    await p.getByRole('button', { name: 'Sí, borrar' }).click();
    await p.getByText('Tu perfil se borró de este dispositivo.').waitFor();
    assert.equal(await p.evaluate(() => localStorage.getItem('tp-dna')), null);
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    assert.equal(await p.getByRole('button', { name: 'Usar mi Travel DNA' }).count(), 0);
  });
  await step('Nav: «Yo» existe y marca la página activa', async () => {
    await p.goto(BASE + '/perfil', { waitUntil: 'networkidle' });
    assert.equal(await p.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Yo' }).getAttribute('aria-current'), 'page');
    const box = await p.locator('nav[aria-label="Principal"]:visible').boundingBox();
    assert.ok(box.width <= 390, 'tabbar desborda');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'scroll horizontal: ' + sw);
  });
  await ctx.close();

  // ---------- What-If con datos reales ----------
  // Sin precios reales conectados no hay costo que simular: el panel no se ofrece y la ficha lo explica.
  // (El motor What-If sigue cubierto por pruebas unitarias con fixtures; esta UI volverá a probarse
  // completa cuando exista una fuente real de precios.)
  for (const [w, h, tag] of [[390, 844, 'mobile'], [1280, 900, 'desktop']]) {
    ({ ctx, p } = await mk(w, h));
    await p.goto(`${BASE}/destino/CUZ?q=${q}`, { waitUntil: 'networkidle' });
    await step(`WhatIf[${tag}]: sin precios reales no se ofrece simular (no se inventan costos)`, async () => {
      await p.getByText('Información limitada').first().waitFor({ timeout: 20000 });
      assert.equal(await p.getByRole('heading', { name: '¿Y si cambio algo?' }).count(), 0);
      assert.ok(await p.getByText(/Qué datos faltan/).count());
    });
    await step(`WhatIf[${tag}]: la ficha distingue datos disponibles de los que faltan`, async () => {
      const t = await p.locator('main').innerText();
      assert.match(t, /Clima\s+Disponible/); assert.match(t, /Precio\s+Sin datos/);
    });
    await step(`WhatIf[${tag}]: sin desbordamiento horizontal`, async () => {
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= w, `scrollWidth ${sw} > ${w}`);
    });
    await ctx.close();
  }

  await browser.close();
  console.log(results.map(([s, n]) => `${s}  ${n}`).join('\n'));
  console.log('\nErrores de consola inesperados:', errors.length ? '\n' + errors.join('\n') : 'ninguno');
  console.log(`\nTOTAL: ${results.filter(r => r[0] === 'PASS').length}/${results.length} pasan`);
  process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
})();
