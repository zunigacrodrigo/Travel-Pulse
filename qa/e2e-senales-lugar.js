// E2E de reportes de viajeros POR LUGAR (PulseMesh) en Mi viaje y Mi día. Supabase simulado con las formas de PostgREST/GoTrue.
// Datos reales grabados: el día de São Paulo (qa/fixtures/day-plan-real.json) y los horarios de OpenStreetMap (nominatim-lookup-real.json).
// OJO: aún no existe una comunidad real; los REPORTES que devuelve el servidor simulado son de prueba y se declaran así en cada fila.
// Compilar con: NEXT_PUBLIC_SUPABASE_URL=https://fake-ref.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt anon falso> npm run build
// Ejecutar: node qa/e2e-senales-lugar.js   (scripts/e2e.mjs lo corre en el grupo «nube simulada»)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3102';
const HOST = 'https://fake-ref.supabase.co';
const REAL = JSON.parse(fs.readFileSync(__dirname + '/fixtures/day-plan-real.json', 'utf8'));
const LOOKUP = JSON.parse(fs.readFileSync(__dirname + '/../src/lib/day/__fixtures__/nominatim-lookup-real.json', 'utf8'));
const horarios = Object.fromEntries(LOOKUP.map((r) => [`${r.osm_type}/${r.osm_id}`, { hoursRaw: r.extratags.opening_hours ?? null }]));
const MASP = 'way/1370081491', CUBO = 'way/1190506909';
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = { id: '11111111-2222-3333-4444-555555555555', email: 'viajera@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const session = () => ({ access_token: `h.${b64({ sub: USER.id, role: 'authenticated', exp: 4102444800 })}.s`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: USER });
const iso = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const row = (o) => ({ id: 'p1', city_key: 'sao-paulo-br', category: 'afluencia', kind: 'fila_larga', title: 'Fila larga (señal de prueba)', detail: null, price_amount: null, price_currency: null, observed_at: iso(-0.7), expires_at: iso(5), independent_count: 1, contradicted_count: 0, state: 'por_confirmar', is_mine: false, place_id: MASP, place_name: 'Museu de Arte de São Paulo', ...o });

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
    const mk = async ({ signedIn = false, rows = [], failView = false, failPost = null }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
      const calls = []; let current = rows;
      await ctx.route('**/api/day-plan', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REAL) }));
      await ctx.route('**/api/trip-review', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkedAt: new Date().toISOString(), weather: REAL.weather.hours, hours: horarios, sources: [{ name: 'OpenStreetMap (Nominatim)', url: 'x', status: 'ok' }, { name: 'Open-Meteo', url: 'x', status: 'ok' }], warnings: [] }) }));
      await ctx.route(`${HOST}/**`, async (route) => {
        const req = route.request(); const url = new URL(req.url());
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const body = req.postData();
        calls.push({ m: req.method(), p: url.pathname, q: url.search, body: body ? JSON.parse(body) : null });
        const json = (s, d) => route.fulfill({ status: s, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(d) });
        if (url.pathname === '/rest/v1/pulse_signals_public') return failView ? json(500, { message: 'caído' }) : json(200, current);
        if (req.method() === 'POST' && failPost && url.pathname === failPost.path) return json(400, { code: '23514', details: null, hint: null, message: failPost.message });
        if (req.method() === 'POST' && url.pathname === '/rest/v1/pulse_signals') { current = [...current, row({ id: 'nuevo', ...body && JSON.parse(body), is_mine: true })]; return route.fulfill({ status: 201, headers: cors, body: '' }); }
        if (req.method() === 'POST') return route.fulfill({ status: 201, headers: cors, body: '' });
        return json(404, {});
      });
      const p = await ctx.newPage();
      p.on('dialog', (d) => d.accept());
      p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 200)}`); });
      p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 200)}`));
      if (signedIn) await p.addInitScript((s) => localStorage.setItem('sb-fake-ref-auth-token', JSON.stringify(s)), session());
      return { ctx, p, calls };
    };
    const abrirViaje = async (p) => {
      await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: 'Armar mi día' }).click();
      await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 });
      await p.getByRole('button', { name: 'Guardar en Mi viaje' }).click();
      await p.waitForSelector('.tt-timeline-item');
    };
    const lineaDe = (p, nombre) => p.getByRole('group', { name: new RegExp(`Reportes de viajeros: ${nombre}`) });

    // 1) Sin reportes y sin sesión
    { const { ctx, p, calls } = await mk({ signedIn: false, rows: [] }); await abrirViaje(p);
      await step(`[${name}] sin reportes: cada parada dice exactamente que aún no hay, y consulta una sola vez por ciudad y lugares`, async () => {
        await lineaDe(p, 'Museu de Arte').getByText('Aún no hay reportes de viajeros aquí').waitFor();
        assert.equal(await p.getByText('Aún no hay reportes de viajeros aquí').count(), REAL.plan.stops.length);
        // Se mide Mi viaje solo: se vacía el registro y se recarga esa pantalla.
        calls.length = 0;
        await p.reload(); await p.waitForSelector('.tt-timeline-item'); await p.getByText('Aún no hay reportes de viajeros aquí').first().waitFor();
        const q = calls.filter((c) => c.p === '/rest/v1/pulse_signals_public');
        assert.equal(q.length, 1, 'Mi viaje hace una sola consulta para todos los lugares');
        assert.match(decodeURIComponent(q[0].q), /city_key=eq\.sao-paulo-br/);
        for (const s of REAL.plan.stops) assert.ok(decodeURIComponent(q[0].q).includes(s.place.id), `consulta ${s.place.id}`);
      });
      await step(`[${name}] sin sesión: invita a iniciar sesión y no hay botones de acción`, async () => {
        assert.ok(await p.getByRole('link', { name: 'Inicia sesión para reportar' }).first().isVisible());
        assert.equal(await p.getByRole('button', { name: 'Lo confirmo' }).count(), 0);
        assert.equal(await p.getByRole('button', { name: 'Reportar algo de este lugar' }).count(), 0);
      });
      await ctx.close(); }

    // 2) Con un reporte de 1 persona
    { const { ctx, p } = await mk({ signedIn: false, rows: [row({})] }); await abrirViaje(p);
      await step(`[${name}] un reporte de 1 persona se muestra como por confirmar y no oficial, solo en SU parada`, async () => {
        const masp = lineaDe(p, 'Museu de Arte');
        await masp.getByText(/Fila larga · 1 viajero · hace \d+ min · falta confirmar · no oficial/).waitFor();
        assert.match(await lineaDe(p, 'Cubo Smoked').innerText(), /Aún no hay reportes de viajeros aquí/);
      });
      await ctx.close(); }

    // 3) Con sesión: confirmar, contradecir, reportar
    { const { ctx, p, calls } = await mk({ signedIn: true, rows: [row({})] }); await abrirViaje(p);
      const masp = lineaDe(p, 'Museu de Arte');
      await step(`[${name}] con sesión: «Lo confirmo» registra una confirmación del reporte`, async () => {
        await masp.getByRole('button', { name: 'Lo confirmo' }).click();
        await masp.getByText(/registramos que lo confirmas/).waitFor();
        const c = calls.find((x) => x.m === 'POST' && x.p === '/rest/v1/pulse_confirmations');
        assert.deepEqual({ signal_id: c.body.signal_id, verdict: c.body.verdict, user_id: c.body.user_id }, { signal_id: 'p1', verdict: 'confirma', user_id: USER.id });
      });
      await step(`[${name}] con sesión: «No es así» registra una contradicción`, async () => {
        await masp.getByRole('button', { name: 'No es así' }).click();
        await masp.getByText(/registramos que no coincide/).waitFor();
        assert.ok(calls.some((x) => x.p === '/rest/v1/pulse_confirmations' && x.body.verdict === 'contradice'));
      });
      await step(`[${name}] reportar: se publica con el lugar, sin ubicación del viajero y sin que él decida la vigencia`, async () => {
        await lineaDe(p, 'Cubo Smoked').getByRole('button', { name: 'Reportar algo de este lugar' }).click();
        const cubo = lineaDe(p, 'Cubo Smoked');
        await cubo.getByRole('button', { name: 'Muy lleno' }).click();
        assert.match(await cubo.innerText(), /sin tu nombre.*No se envía tu ubicación.*no una fuente oficial/s);
        await cubo.getByRole('button', { name: 'Publicar reporte' }).click();
        await cubo.getByText(/quedó publicado sin tu nombre/).waitFor();
        const post = calls.find((x) => x.m === 'POST' && x.p === '/rest/v1/pulse_signals');
        assert.equal(post.body.place_id, CUBO); assert.equal(post.body.place_name, 'Cubo Smoked BBQ');
        assert.equal(post.body.city_key, 'sao-paulo-br'); assert.equal(post.body.kind, 'muy_lleno'); assert.equal(post.body.category, 'afluencia');
        assert.equal(post.body.user_id, USER.id);
        assert.equal(post.body.lat_approx, null); assert.equal(post.body.lon_approx, null);
        for (const k of ['expires_at', 'flags', 'hidden', 'observed_at']) assert.equal(k in post.body, false, `no envía ${k}`);
      });
      await ctx.close(); }

    // 4) Reporte propio: no se confirma a sí mismo
    { const { ctx, p } = await mk({ signedIn: true, rows: [row({ is_mine: true })] }); await abrirViaje(p);
      await step(`[${name}] un reporte propio no ofrece confirmarse a sí mismo`, async () => {
        const masp = lineaDe(p, 'Museu de Arte'); await masp.getByText(/Fila larga/).waitFor();
        assert.equal(await masp.getByRole('button', { name: 'Lo confirmo' }).count(), 0);
        assert.ok(await masp.getByRole('button', { name: 'Reportar algo de este lugar' }).isVisible());
      });
      await ctx.close(); }

    // 5) El servidor rechaza el reporte
    { const { ctx, p } = await mk({ signedIn: true, rows: [], failPost: { path: '/rest/v1/pulse_signals', message: 'Límite diario de reportes alcanzado' } }); await abrirViaje(p);
      await step(`[${name}] si la base rechaza el reporte, lo dice con un mensaje claro y la pantalla sigue funcionando`, async () => {
        const masp = lineaDe(p, 'Museu de Arte');
        await masp.getByRole('button', { name: 'Reportar algo de este lugar' }).click();
        await masp.getByRole('button', { name: 'Cerrado' }).click();
        await masp.getByRole('button', { name: 'Publicar reporte' }).click();
        await masp.getByRole('alert').waitFor();
        assert.match(await masp.getByRole('alert').innerText(), /límite de 20 reportes/);
        assert.ok(await p.locator('.tt-timeline-item').first().isVisible());
      });
      await ctx.close(); }

    // 6) La base no responde: NO se confunde con «sin reportes»
    { const { ctx, p } = await mk({ signedIn: false, failView: true }); await abrirViaje(p);
      await step(`[${name}] si la consulta falla, dice que no se pudo consultar y NUNCA «aún no hay reportes»`, async () => {
        await p.getByText('No se pudieron consultar los reportes de viajeros.').first().waitFor();
        assert.equal(await p.getByText('Aún no hay reportes de viajeros aquí').count(), 0);
      });
      await ctx.close(); }

    // 7) Revisión: solo lo corroborado por 3 personas genera aviso
    { const { ctx, p } = await mk({ signedIn: false, rows: [row({ id: 'c1', category: 'condiciones', kind: 'cerrado', title: 'Cerrado (señal de prueba)', independent_count: 3, state: 'corroborada' }), row({ id: 'r1', place_id: CUBO, place_name: 'Cubo Smoked BBQ', category: 'condiciones', kind: 'cerrado', independent_count: 1, state: 'por_confirmar' })] }); await abrirViaje(p);
      const review = p.getByRole('region', { name: 'Revisar con datos de hoy' });
      const n = () => p.locator('.tt-timeline-item').count();
      await step(`[${name}] la revisión avisa del lugar corroborado por 3 personas y NO del rumor de 1 persona`, async () => {
        await review.getByRole('button', { name: 'Revisar ahora' }).click();
        const aviso = review.getByRole('article', { name: /Museu de Arte/ });
        await aviso.waitFor();
        assert.match(await aviso.innerText(), /reporte de viajeros · no oficial/i);
        assert.match(await aviso.innerText(), /3 personas distintas/);
        assert.equal(await review.getByRole('article', { name: /Cubo Smoked/ }).count(), 0);
      });
      await step(`[${name}] «Quitar del día» solo ocurre con el clic, queda en el historial y se deshace`, async () => {
        const antes = await n();
        assert.equal(antes, REAL.plan.stops.length, 'mostrar el aviso no cambió el plan');
        await review.getByRole('article', { name: /Museu de Arte/ }).getByRole('button', { name: 'Quitar del día' }).click();
        assert.equal(await n(), antes - 1);
        await p.getByRole('button', { name: 'Deshacer último cambio' }).click();
        assert.equal(await n(), antes);
      });
      await ctx.close(); }

    // 8) Revisión con la consulta de reportes caída
    { const { ctx, p } = await mk({ signedIn: false, failView: true }); await abrirViaje(p);
      await step(`[${name}] la revisión declara que no pudo consultar los reportes de viajeros, sin inventar avisos`, async () => {
        const review = p.getByRole('region', { name: 'Revisar con datos de hoy' });
        await review.getByRole('button', { name: 'Revisar ahora' }).click();
        await review.getByText(/No se pudieron consultar los reportes de viajeros: se muestra el plan sin ellos/).waitFor();
        assert.equal(await review.getByRole('article').count(), 0);
      });
      await ctx.close(); }

    // 9) Mi día también muestra la línea de viajeros
    { const { ctx, p } = await mk({ signedIn: false, rows: [row({})] });
      await p.goto(`${BASE}/dia`, { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: 'Armar mi día' }).click();
      await p.getByRole('heading', { name: /jueves/i }).waitFor({ timeout: 15000 });
      await step(`[${name}] Mi día muestra lo mismo bajo cada parada`, async () => {
        await lineaDe(p, 'Museu de Arte').getByText(/Fila larga · 1 viajero/).waitFor();
        await lineaDe(p, 'Cubo Smoked').getByText('Aún no hay reportes de viajeros aquí').waitFor();
      });
      await step(`[${name}] sin desbordamiento horizontal`, async () => {
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      });
      await ctx.close(); }
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
