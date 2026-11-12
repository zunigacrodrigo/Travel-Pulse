// E2E de «Mi día en la ciudad». La API se simula con una respuesta REAL grabada (qa/fixtures/day-plan-real.json,
// São Paulo, jueves 5 de noviembre de 2026); el navegador, el mapa y la pantalla son los reales.
// Servidor: PORT=3102 ... node .next/standalone/server.js   ·   Ejecutar: node qa/e2e-dia.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3102';
const REAL = JSON.parse(fs.readFileSync(__dirname + '/fixtures/day-plan-real.json', 'utf8'));
const OUT = '/tmp/claude-0/qa/shots'; fs.mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
    const open = async (variant = (r) => r) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
      const bodies = [];
      await ctx.route('**/api/day-plan', async (route) => {
        bodies.push(JSON.parse(route.request().postData()));
        const base = JSON.parse(JSON.stringify(REAL));
        const r = variant(base, bodies.length);
        if (r === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ERROR_INTERNO', message: 'No pudimos armar el día. Inténtalo de nuevo en un momento.' } }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
      });
      const p = await ctx.newPage();
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 180)}`); });
      p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 180)}`));
      await p.goto(`${BASE}/dia`, { waitUntil: 'domcontentloaded' });
      return { ctx, p, bodies };
    };
    const arm = async (p) => { await p.getByRole('button', { name: 'Armar mi día' }).click(); await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 }); };

    { const { ctx, p, bodies } = await open();
      await step(`[${name}] la fecha por defecto es válida y el formulario trae los 4 deseos del caso norte`, async () => {
        assert.match(await p.getByLabel('Fecha').inputValue(), /^\d{4}-\d{2}-\d{2}$/);
        for (const k of ['Museo', 'Galería o centro cultural', 'Restaurante', 'Pub o bar']) assert.equal(await p.getByRole('button', { name: k, exact: true }).getAttribute('aria-pressed'), 'true');
        assert.equal(await p.getByRole('button', { name: 'Parque', exact: true }).getAttribute('aria-pressed'), 'false');
      });
      await step(`[${name}] armar el día envía ciudad, fecha, horas y deseos exactos`, async () => {
        await p.getByLabel('Fecha').fill('2026-11-05'); await arm(p);
        assert.deepEqual(bodies[0], { city: 'sao-paulo-br', date: '2026-11-05', startMin: 660, endMin: 1380, wishes: [{ kind: 'museo' }, { kind: 'restaurante' }, { kind: 'galeria' }, { kind: 'pub' }] });
      });
      await step(`[${name}] muestra las 4 paradas con horas y estados reales (abierto/cierre, incluso después de medianoche)`, async () => {
        assert.equal(await p.locator('ol > li').count(), 4);
        const t = await p.locator('ol').innerText();
        assert.match(t, /11:01[\s\S]*12:31[\s\S]*Museu de Arte de São Paulo[\s\S]*Abierto · cierra 20:00/);
        assert.match(t, /Bar Charles Edward[\s\S]*cierra 03:30/);
        assert.match(t, /Horario en OpenStreetMap: Tu-Su 10:00-18:00; Th 10:00-20:00/);
      });
      await step(`[${name}] muestra la foto de Wikipedia con atribución y enlace a la licencia`, async () => {
        const fig = p.locator('figure').first();
        assert.match(await fig.locator('img').getAttribute('src'), /^https:\/\/thumb\.wikimedia\.org\//);
        assert.ok(await fig.getByRole('link', { name: /Wikipedia \/ Wikimedia Commons/ }).count());
      });
      await step(`[${name}] cada traslado indica el modo y que el auto no incluye tráfico`, async () => {
        const t = await p.locator('ol').innerText();
        assert.match(t, /A pie · \d+ min desde Av\. Paulista/); assert.match(t, /En auto, sin tráfico · \d+ min/);
      });
      await step(`[${name}] la lluvia probable del pronóstico se marca en el trayecto y en el gráfico`, async () => {
        assert.ok(await p.getByText(/lluvia probable en el trayecto/).count());
        assert.match(await p.getByRole('img', { name: /Lluvia probable de 11:00 a 24:00/ }).getAttribute('aria-label'), /hasta 84 %/);
      });
      await step(`[${name}] el mapa es real, numera las 4 paradas y su alternativa de texto está en la lista`, async () => {
        await p.locator('.leaflet-container').waitFor();
        assert.equal(await p.locator('.day-pin:not(.is-origin)').count(), 4);
        assert.ok(await p.getByRole('img', { name: /Mapa de Av\. Paulista con 4 paradas/ }).count());
      });
      await step(`[${name}] «¿Por qué este lugar?» explica la decisión`, async () => {
        const d = p.locator('details', { hasText: '¿Por qué este lugar?' }).first(); await d.locator('summary').click();
        assert.match(await d.innerText(), /Horario de OpenStreetMap: abierto hasta las 20:00/);
      });
      await step(`[${name}] «Cambiar por otro cercano» fija ese lugar en el deseo correcto y vuelve a armar`, async () => {
        const stop2 = p.locator('ol > li').nth(1); await stop2.locator('summary', { hasText: 'Cambiar por otro cercano' }).click();
        const alt = REAL.plan.stops[1].alternatives[0].place;
        await stop2.getByRole('button', { name: new RegExp(alt.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
        await p.waitForTimeout(400);
        const sent = bodies[bodies.length - 1]; const idx = REAL.plan.stops[1].wishIndex;
        assert.equal(sent.wishes[idx].pin, alt.id);
      });
      await step(`[${name}] «Quitar» elimina exactamente el deseo de esa parada y ninguno más`, async () => {
        const prev = bodies[bodies.length - 1].wishes;
        // Se usa la última parada: su deseo NO es el primero, así un «quitar» que borre siempre el índice 0 se detecta.
        const last = REAL.plan.stops.length - 1; assert.notEqual(REAL.plan.stops[last].wishIndex, 0);
        await p.locator('ol > li').nth(last).getByRole('button', { name: 'Quitar' }).click(); await p.waitForTimeout(400);
        const sent = bodies[bodies.length - 1];
        assert.deepEqual(sent.wishes, prev.filter((_, i) => i !== REAL.plan.stops[last].wishIndex));
      });
      await step(`[${name}] «Quiero un pub» agrega un pub; si ya había uno, lo pone después de la última parada`, async () => {
        const prev = bodies[bodies.length - 1].wishes; const hadPub = prev.some((x) => x.kind === 'pub');
        await p.getByRole('button', { name: 'Quiero un pub' }).click(); await p.waitForTimeout(400);
        const sent = bodies[bodies.length - 1];
        assert.equal(sent.wishes.length, prev.length + 1);
        const added = sent.wishes[sent.wishes.length - 1]; assert.equal(added.kind, 'pub');
        if (hadPub) assert.equal(typeof added.minStart, 'number'); else assert.equal(added.minStart, undefined);
        assert.deepEqual(sent.wishes.slice(0, -1), prev);
      });
      await step(`[${name}] «Está lloviendo» con todo bajo techo no cambia nada y lo explica`, async () => {
        const n = bodies.length;
        await p.getByRole('button', { name: 'Está lloviendo' }).click();
        await p.getByText(/Tu día ya es bajo techo/).waitFor(); assert.equal(bodies.length, n);
      });
      await step(`[${name}] con un parque, «Está lloviendo» lo cambia por un museo bajo techo y lo cuenta`, async () => {
        await p.getByRole('button', { name: 'Parque', exact: true }).click();
        await p.getByRole('button', { name: 'Está lloviendo' }).click(); await p.waitForTimeout(400);
        const sent = bodies[bodies.length - 1];
        assert.ok(!sent.wishes.some((x) => x.kind === 'parque')); 
        await p.getByText(/Parque \(al aire libre\) → Museo \(bajo techo\)/).waitFor();
      });
      await step(`[${name}] sin desbordamiento horizontal`, async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true));
      await step(`[${name}] una sola navegación visible con 4 destinos; el riel lateral solo en escritorio`, async () => {
        assert.equal(await p.locator('nav[aria-label="Principal"]:visible').count(), 1);
        assert.equal(await p.locator('nav[aria-label="Principal"]:visible a').count(), 4);
        assert.equal(await p.locator('aside[aria-label="Principal"]').isVisible(), name === 'escritorio');
        assert.equal(await p.locator('nav[aria-label="Principal"]:visible [aria-current="page"]').innerText(), 'Mi viaje');
      });
      await p.screenshot({ path: `${OUT}/dia-${name}.png`, fullPage: true }); await ctx.close(); }

    { const { ctx, p } = await open(() => 'error');
      await step(`[${name}] si la API falla muestra el error sin romper la página`, async () => {
        await p.getByRole('button', { name: 'Armar mi día' }).click();
        await p.locator('[role=alert]').filter({ hasText: /No pudimos armar el día/ }).waitFor();
        assert.ok(await p.getByRole('button', { name: 'Armar mi día' }).isEnabled());
      }); await ctx.close(); }

    { const { ctx, p } = await open((r) => { r.warnings = ['No pudimos consultar el pronóstico (HTTP 429): no se evaluó la lluvia.']; r.weather = null; r.plan.unplaced = [{ wish: { kind: 'galeria' }, wishIndex: 1, reason: 'ningún galería o centro cultural cabe: X está cerrado ese día' }]; return r; });
      await p.getByRole('button', { name: 'Armar mi día' }).click(); await p.getByRole('heading', { name: /jueves/i }).waitFor();
      await step(`[${name}] los avisos de fuentes y lo que no se pudo programar se ven, con su motivo`, async () => {
        assert.ok(await p.getByText(/No pudimos consultar el pronóstico/).count());
        assert.ok(await p.getByText(/No hay pronóstico por hora/).count());
        assert.match(await p.getByRole('heading', { name: 'Lo que no pudimos programar' }).locator('..').innerText(), /está cerrado ese día/);
      }); await ctx.close(); }

    { const { ctx, p } = await open((r) => { r.plan.stops = []; r.plan.unplaced = [{ wish: { kind: 'museo' }, wishIndex: 0, reason: 'no hay museos disponibles en la zona' }]; return r; });
      await p.getByRole('button', { name: 'Armar mi día' }).click(); await p.getByRole('heading', { name: /jueves/i }).waitFor();
      await step(`[${name}] sin paradas: lo dice y no inventa un itinerario`, async () => {
        await p.getByText(/No pudimos programar ninguna parada/).waitFor(); assert.equal(await p.locator('ol > li').count(), 0);
      }); await ctx.close(); }
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
