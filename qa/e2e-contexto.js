// E2E del «Contexto del día» en Mi día. Datos REALES grabados el 16-nov-2026 (qa/fixtures/contexto-real.json: feriados de Nager.Date
// y aire/UV de Open-Meteo para São Paulo, pasados por el código real). Solo se simulan las respuestas de /api/day-plan y /api/contexto.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3102';
const REAL = JSON.parse(fs.readFileSync(__dirname + '/fixtures/day-plan-real.json', 'utf8'));
const CTX = JSON.parse(fs.readFileSync(__dirname + '/fixtures/contexto-real.json', 'utf8'));
const GUIA = JSON.parse(fs.readFileSync(__dirname + '/fixtures/guia-real.json', 'utf8'));
const ENT = JSON.parse(fs.readFileSync(__dirname + '/fixtures/entorno-real.json', 'utf8'));
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
    let modo = 'feriado'; let guia = 'ok'; let entorno = 'ok'; const planPedidos = []; const pedidos = [];
    await ctx.route('**/api/day-plan', (r) => { planPedidos.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REAL) }); });
    await ctx.route('**/api/contexto**', (r) => { pedidos.push(new URL(r.request().url()).search); return modo === 'error' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(modo === 'vacio' ? { ...CTX.normal, items: [], gaps: [] } : modo === 'brecha' ? { ...CTX.normal, items: [], gaps: [{ source: 'Feriados (Nager.Date)', reason: 'HTTP 500' }] } : CTX[modo]) }); });
    await ctx.route('**/api/guia**', (r) => guia === 'error' ? r.fulfill({ status: 502, contentType: 'application/json', body: '{}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(guia === 'vieja' ? { ...GUIA, stale: true, tips: [...GUIA.tips, { id: 'seguridad', title: 'Seguridad', text: 'Texto de prueba en inglés para la insignia.', lang: 'en' }] } : GUIA) }));
    await ctx.route('**/api/entorno**', (r) => entorno === 'error' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entorno === 'brecha' ? { ...ENT, heritage: null, gaps: [{ source: 'Patrimonio (Wikidata)', reason: 'HTTP 429' }] } : entorno === 'vieja' ? { ...ENT, nature: { ...ENT.nature, stale: true } } : ENT) }));
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|status of 50[02]|Error: 50[02]/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 180)}`); });
    p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 180)}`));
    const armar = async () => { await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Armar mi día' }).click(); await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 }); };
    const card = p.getByRole('region', { name: 'Contexto del día' });

    await armar();
    await step(`[${name}] aparece el contexto con feriado, aire y UV, cada uno con su fuente`, async () => {
      await card.getByText(/Feriado: Dia da Consciência Negra/).waitFor();
      const t = await card.innerText();
      assert.match(t, /Aire dañino/); assert.match(t, /Radiación UV muy alta/);
      assert.ok(await card.getByRole('link', { name: /Nager\.Date/ }).isVisible());
      assert.ok((await card.getByRole('link', { name: /Open-Meteo/ }).count()) >= 1);
    });
    await step(`[${name}] consulta la ciudad y la fecha del plan`, async () => { assert.match(pedidos.at(-1), /city=sao-paulo-br&date=\d{4}-\d{2}-\d{2}/); });
    await step(`[${name}] los avisos se marcan, no solo por color, y se distinguen de lo que es pronóstico`, async () => {
      assert.ok((await card.locator('li[data-severity="aviso"]').count()) >= 2);
      assert.match(await card.innerText(), /⚠/); assert.match(await card.innerText(), /Pronóstico · /); assert.match(await card.innerText(), /Dato publicado · /);
    });
    await step(`[${name}] no afirma qué lugar cierra por el feriado`, async () => { assert.match(await card.innerText(), /no tenemos ese dato/); });
    modo = 'brecha'; await armar();
    await step(`[${name}] una fuente que falló se dice, sin inventar un «todo bien»`, async () => {
      await card.getByText(/Sin dato de Feriados \(Nager\.Date\): HTTP 500/).waitFor();
      assert.doesNotMatch(await card.innerText(), /Sin novedades/);
    });
    modo = 'vacio'; await armar();
    await step(`[${name}] sin nada que reportar y sin fallas, lo dice`, async () => { await card.getByText('Sin novedades para ese día.').waitFor(); });
    modo = 'error'; await armar();
    await step(`[${name}] si la consulta falla, lo dice y el plan sigue ahí`, async () => {
      await card.getByText(/No pudimos consultar el contexto del día/).waitFor();
      assert.ok(await p.getByRole('heading', { name: /jueves/i }).isVisible());
    });
    await step(`[${name}] sin desbordamiento horizontal`, async () => { modo = 'feriado'; await armar(); await card.getByText(/Feriado/).waitFor(); assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); });
    const gcard = p.getByRole('region', { name: 'Guía del destino' });
    guia = 'ok'; modo = 'feriado'; await armar();
    await step(`[${name}] la guía muestra consejos citados, con enlace, licencia y aviso de que no está verificada`, async () => {
      await gcard.getByText('Cómo moverse').waitFor();
      const t = await gcard.innerText();
      assert.match(t, /CC BY-SA 4\.0/); assert.match(t, /no lo ha verificado/);
      assert.ok(await gcard.getByRole('link', { name: 'Wikivoyage' }).isVisible());
      assert.equal(await gcard.getByText('Seguridad').count(), 0); // en la guía real de Santiago esa sección está vacía: no se inventa
    });
    await step(`[${name}] un consejo se abre y muestra el texto citado`, async () => {
      await gcard.getByText('Cómo moverse').click();
      assert.ok((await gcard.locator('details[open] p').first().innerText()).length > 40);
    });
    guia = 'vieja'; await armar();
    await step(`[${name}] un consejo en inglés lo dice y una copia vieja lo avisa`, async () => {
      await gcard.getByText('en inglés', { exact: true }).waitFor();
      assert.match(await gcard.innerText(), /copia guardada/);
    });
    guia = 'error'; await armar();
    await step(`[${name}] si la guía falla, lo dice y el plan sigue ahí`, async () => {
      await gcard.getByText(/No pudimos consultar la guía/).waitFor();
      assert.ok(await p.getByRole('heading', { name: /jueves/i }).isVisible());
    });
    const ecard = p.getByRole('region', { name: 'Patrimonio y naturaleza' });
    entorno = 'ok'; await armar();
    await step(`[${name}] patrimonio: un bien con varias declaratorias aparece una vez, con enlace a su fuente`, async () => {
      await ecard.getByRole('link', { name: 'Palacio de La Moneda' }).waitFor();
      assert.equal(await ecard.getByRole('link', { name: 'Palacio de La Moneda' }).count(), 1);
      assert.match(await ecard.innerText(), /Monumento Histórico de Chile · lista indicativa|lista indicativa del Patrimonio de la Humanidad/);
      assert.match(await ecard.getByRole('link', { name: 'Palacio de La Moneda' }).getAttribute('href'), /wikidata\.org\/wiki\/Q1146881/);
    });
    await step(`[${name}] aves: nombres científicos con registros, y dice qué cuenta y qué no`, async () => {
      const t = await ecard.innerText();
      assert.match(t, /Turdus falcklandii/); assert.match(t, /30\.300 registros/);
      assert.match(t, /no cuántas aves hay/); assert.match(t, /no si conviene visitarlo ni si está abierto/);
      assert.doesNotMatch(t, /Daptrius/);
    });
    entorno = 'brecha'; await armar();
    await step(`[${name}] si Wikidata falla, lo dice y las aves siguen`, async () => {
      await ecard.getByText(/Sin dato de Patrimonio \(Wikidata\): HTTP 429/).waitFor();
      assert.match(await ecard.innerText(), /Turdus falcklandii/);
    });
    entorno = 'vieja'; await armar();
    await step(`[${name}] una copia vieja se avisa`, async () => { await ecard.getByText(/Copia guardada: GBIF no respondió/).waitFor(); });
    entorno = 'error'; await armar();
    await step(`[${name}] si todo falla, lo dice y el plan sigue ahí`, async () => {
      await ecard.getByText(/No pudimos consultar esta información/).waitFor();
      assert.ok(await p.getByRole('heading', { name: /jueves/i }).isVisible());
    });
    const conParque = async () => { await p.goto(`${BASE}/dia?city=sao-paulo-br&date=2026-11-17&from=09:00&to=20:00&w=parque,museo&go=1`, { waitUntil: 'networkidle' }); await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 }); };
    modo = 'normal'; entorno = 'ok'; guia = 'ok'; planPedidos.length = 0; await conParque();
    const swapBtn = card.getByRole('button', { name: /Cambiar lo del aire libre por museos y galerías bajo techo/ });
    await step(`[${name}] con aire dañino y un parque en el día, ofrece cambiarlo por algo bajo techo (y no lo hace solo)`, async () => {
      await swapBtn.waitFor();
      assert.equal(planPedidos.length, 1, 'solo el pedido inicial: el cambio espera el clic');
      assert.deepEqual(planPedidos[0].wishes.map((w) => w.kind), ['parque', 'museo']);
    });
    await step(`[${name}] al hacer clic, vuelve a armar el día sin nada al aire libre y lo cuenta con el motivo`, async () => {
      await swapBtn.click();
      await p.getByText(/Cambié lo que era al aire libre por lugares bajo techo por el aire dañino: Parque \(al aire libre\) → Museo/).waitFor();
      assert.deepEqual(planPedidos.at(-1).wishes.map((w) => w.kind), ['museo', 'museo']);
      await card.getByText('Tu día ya es bajo techo: no hay nada al aire libre que cambiar.').waitFor();
      assert.equal(await swapBtn.count(), 0);
    });
    modo = 'normal'; await armar();
    await step(`[${name}] con todo el día bajo techo no ofrece el botón y lo dice`, async () => {
      await card.getByText('Tu día ya es bajo techo: no hay nada al aire libre que cambiar.').waitFor();
      assert.equal(await swapBtn.count(), 0);
    });
    modo = 'vacio'; await conParque();
    await step(`[${name}] sin aviso de aire no hay botón aunque haya un parque`, async () => {
      await card.getByText('Sin novedades para ese día.').waitFor();
      assert.equal(await swapBtn.count(), 0);
    });
    await ctx.close();
  }
  await step('sin errores de consola', async () => assert.deepEqual(errors, []));
  await browser.close();
  for (const [s, n] of results) console.log(s, n);
  const bad = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - bad}/${results.length}`); process.exit(bad ? 1 : 0);
})();
