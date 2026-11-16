// E2E de «Revisar con datos de hoy» en Mi viaje. Datos REALES grabados: el día de São Paulo (qa/fixtures/day-plan-real.json),
// el pronóstico de ese jueves y los horarios de OpenStreetMap (src/lib/day/__fixtures__/nominatim-lookup-real.json, 16-nov-2026).
// Solo la respuesta de /api/trip-review se simula con esas grabaciones. Servidor: ver scripts/e2e.mjs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3102';
const REAL = JSON.parse(fs.readFileSync(__dirname + '/fixtures/day-plan-real.json', 'utf8'));
const LOOKUP = JSON.parse(fs.readFileSync(__dirname + '/../src/lib/day/__fixtures__/nominatim-lookup-real.json', 'utf8'));
const horariosReales = Object.fromEntries(LOOKUP.map((r) => [`${r.osm_type}/${r.osm_id}`, { hoursRaw: r.extratags.opening_hours ?? null }]));
const CTX = JSON.parse(fs.readFileSync(__dirname + '/fixtures/contexto-real.json', 'utf8'));
const MASP = 'way/1370081491';
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
    let respuesta = { checkedAt: '2026-11-05T09:30:00.000Z', weather: REAL.weather.hours, hours: horariosReales, sources: [{ name: 'OpenStreetMap (Nominatim)', url: 'https://nominatim.openstreetmap.org/', status: 'ok' }, { name: 'Open-Meteo', url: 'https://open-meteo.com/', status: 'ok' }], warnings: [] };
    let pedidos = [];
    await ctx.route('**/api/day-plan', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REAL) }));
    await ctx.route('**/api/trip-review', (r) => { pedidos.push(JSON.parse(r.request().postData())); return respuesta === 'error' ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'No pudimos revisar el viaje.' } }) }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) }); });
    const p = await ctx.newPage();
    p.on('dialog', (d) => d.accept());
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 180)}`); });
    p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 180)}`));

    await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Armar mi día' }).click();
    await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 });
    await p.getByRole('button', { name: 'Guardar en Mi viaje' }).click();
    await p.waitForSelector('.tt-timeline-item');
    const review = p.getByRole('region', { name: 'Revisar con datos de hoy' });
    const n = () => p.locator('.tt-timeline-item').count();
    const conflictos = async () => Number(await p.locator('.tt-confidence > div', { has: p.locator('small', { hasText: 'Conflictos' }) }).locator('b').innerText());
    const c0 = await conflictos();

    await step(`[${name}] el panel de revisión aparece en un viaje armado en Mi día`, async () => { assert.ok(await review.isVisible()); });
    await step(`[${name}] sin cambios: dice que no encontró nada y muestra la hora y las fuentes`, async () => {
      await review.getByRole('button', { name: 'Revisar ahora' }).click();
      await review.getByText(/No encontré cambios/).waitFor();
      assert.match(await review.innerText(), /Revisado a las .*OpenStreetMap \(Nominatim\): ok/);
      assert.deepEqual(pedidos.at(-1).places.sort(), REAL.plan.stops.map((s) => s.place.id).sort());
      assert.equal(pedidos.at(-1).city, 'sao-paulo-br');
    });
    await step(`[${name}] un horario cambiado se muestra con antes y después, y no se aplica solo`, async () => {
      respuesta = { ...respuesta, hours: { ...horariosReales, [MASP]: { hoursRaw: 'Th 10:00-12:00' } } };
      await review.getByRole('button', { name: 'Revisar de nuevo' }).click();
      const aviso = review.getByRole('article', { name: /Museu de Arte/ });
      await aviso.waitFor();
      assert.match(await aviso.innerText(), /antes 10:00.*20:00.*ahora 10:00.*12:00.*ya no cabe/i);
      assert.equal(await conflictos(), c0); // mostrar el aviso no cambia el plan: el contador de conflictos sigue igual
    });
    await step(`[${name}] «Actualizar horario» lo aplica, queda en el historial y se puede deshacer`, async () => {
      await review.getByRole('button', { name: 'Actualizar horario' }).click();
      assert.equal(await conflictos(), c0 + 1, 'al aplicar el horario nuevo aparece el conflicto real (cierra antes de terminar la visita)');
      assert.match(await p.locator('.tt-result-note').innerText(), /Actualizar horario de Museu de Arte/);
      assert.ok(await p.locator('.tt-history-list li', { hasText: 'Actualizar horario' }).count() >= 1);
      await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
      assert.equal(await p.locator('.tt-history-list li', { hasText: 'Actualizar horario' }).count(), 0);
      assert.equal(await conflictos(), c0, 'deshacer vuelve al plan de antes');
    });
    await step(`[${name}] «Mantener mi plan» descarta el aviso sin cambiar nada`, async () => {
      const antes = await n();
      await review.getByRole('button', { name: 'Revisar de nuevo' }).click();
      const aviso = review.getByRole('article', { name: /Museu de Arte/ });
      await aviso.waitFor();
      await aviso.getByRole('button', { name: 'Mantener mi plan' }).click();
      assert.equal(await review.getByRole('article').count(), 0);
      assert.equal(await n(), antes);
    });
    await step(`[${name}] sin pronóstico, lo declara y no inventa avisos de lluvia`, async () => {
      respuesta = { ...respuesta, hours: horariosReales, weather: null, warnings: ['No hay pronóstico por hora para esa fecha: no se evaluó la lluvia.'], sources: [{ name: 'Open-Meteo', url: 'https://open-meteo.com/', status: 'fuera_de_alcance' }] };
      await review.getByRole('button', { name: 'Revisar de nuevo' }).click();
      await review.getByText(/no se evaluó la lluvia/i).first().waitFor();
      assert.equal(await review.getByRole('article').count(), 0);
    });
    await step(`[${name}] un feriado se avisa con las paradas por confirmar, sin botón que cambie el plan, y se puede descartar`, async () => {
      const antes = await n(); const c1 = await conflictos();
      respuesta = { ...respuesta, hours: horariosReales, weather: REAL.weather.hours, warnings: [], context: CTX.feriado.items.filter((i) => i.kind === 'feriado'), sources: [{ name: 'Feriados (Nager.Date)', url: 'https://date.nager.at', status: 'ok' }] };
      await review.getByRole('button', { name: 'Revisar de nuevo' }).click();
      const aviso = review.getByRole('article', { name: /feriado/ });
      await aviso.waitFor();
      const t = await aviso.innerText();
      assert.match(t, /Feriado · Nager\.Date/i); assert.match(t, /Dia da Consciência Negra/); assert.match(t, /Confirma los horarios de: Museu de Arte/); assert.match(t, /No tenemos el dato/);
      assert.equal(await aviso.getByRole('button').count(), 1, 'solo «Mantener mi plan»: un feriado no cambia el plan solo');
      assert.equal(await n(), antes); assert.equal(await conflictos(), c1);
      await aviso.getByRole('button', { name: 'Mantener mi plan' }).click();
      assert.equal(await review.getByRole('article').count(), 0);
    });
    await step(`[${name}] si no se pudo consultar el contexto del día, lo declara y no inventa avisos`, async () => {
      respuesta = { ...respuesta, context: null, warnings: ['No se evaluó el feriado: HTTP 500'] };
      await review.getByRole('button', { name: 'Revisar de nuevo' }).click();
      await review.getByText(/No se pudo consultar el contexto del día/).first().waitFor();
      assert.equal(await review.getByRole('article').count(), 0);
    });
    await step(`[${name}] si el servidor falla, muestra el error y el plan sigue intacto`, async () => {
      const antes = await n();
      respuesta = 'error';
      await review.getByRole('button', { name: 'Revisar de nuevo' }).click();
      await review.getByRole('alert').waitFor();
      assert.equal(await n(), antes);
    });
    await step(`[${name}] el panel NO aparece en un viaje importado`, async () => {
      await p.evaluate(() => localStorage.clear());
      await p.goto(`${BASE}/trip-twin`); await p.getByRole('heading', { name: /Todavía no tienes/ }).waitFor();
      assert.equal(await p.getByRole('region', { name: 'Revisar con datos de hoy' }).count(), 0);
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
