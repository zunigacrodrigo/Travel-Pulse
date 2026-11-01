// E2E del panel de reportes de viajeros (PulseMesh). Supabase simulado con las formas de PostgREST/GoTrue.
// Compilar con: NEXT_PUBLIC_SUPABASE_URL=https://fake-ref.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt anon falso> npm run build
// Ejecutar: node qa/e2e-pulsemesh.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:3102';
const HOST = 'https://fake-ref.supabase.co';
const OUT = '/tmp/claude-0/qa/shots'; require('fs').mkdirSync(OUT, { recursive: true });
const results = []; const errors = [];
const step = async (n, f) => { try { await f(); results.push(['PASS', n]); } catch (e) { results.push(['FAIL', n + ' -> ' + String(e.message).split('\n')[0]]); } };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = { id: '11111111-2222-3333-4444-555555555555', email: 'viajera@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const session = () => ({ access_token: `h.${b64({ sub: USER.id, role: 'authenticated', exp: 4102444800 })}.s`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: USER });
const iso = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const row = (o) => ({ id: 's1', city_key: 'santiago-cl', category: 'afluencia', kind: 'fila_larga', title: 'Fila larga en el acceso', detail: null, price_amount: null, price_currency: null, observed_at: iso(-1), expires_at: iso(5), independent_count: 1, contradicted_count: 0, state: 'por_confirmar', is_mine: false, ...o });
const ROWS = [
  row({ id: 's1' }),
  row({ id: 's2', category: 'condiciones', kind: 'via_cortada', title: 'Acceso cortado por obras', independent_count: 3, state: 'corroborada', observed_at: iso(-3), expires_at: iso(20) }),
  row({ id: 's3', category: 'precios', kind: 'precio_observado', title: 'Menú del día', price_amount: '7500.00', price_currency: 'CLP', independent_count: 1, observed_at: iso(-5), expires_at: iso(300), is_mine: true }),
];
const CITY = (city, country) => ({ ok: true, city, country, generatedAt: new Date().toISOString(), coordinates: { lat: -33.45, lon: -70.66 }, weather: null, places: [], sources: [], limitations: [] });

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['movil', 390, 844], ['escritorio', 1280, 800]]) {
    const mkctx = async ({ signedIn, rows = ROWS, geo = false, failPost = null }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL', ...(geo ? { geolocation: { latitude: -33.04567, longitude: -71.61987 }, permissions: ['geolocation'] } : {}) });
      const calls = [];
      await ctx.route('**/api/live-data**', (r) => { const u = new URL(r.request().url()); const c = u.searchParams.get('city') || 'Santiago'; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c.startsWith('Buenos') ? CITY('Buenos Aires', 'Argentina') : c.startsWith('Valpar') ? CITY('Valparaíso', 'Chile') : CITY('Santiago', 'Chile')) }); });
      await ctx.route(`${HOST}/**`, async (route) => {
        const req = route.request(); const url = new URL(req.url());
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const body = req.postData();
        calls.push({ m: req.method(), p: url.pathname, q: url.search, body: body ? JSON.parse(body) : null });
        const json = (s, d) => route.fulfill({ status: s, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(d) });
        if (url.pathname === '/rest/v1/pulse_signals_public') {
          const tok = (req.headers()['authorization'] || '').split(' ')[1] || '';
          let mine = false; try { mine = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).role === 'authenticated'; } catch {}
          return json(200, rows.map((r) => ({ ...r, is_mine: mine && r.is_mine })));
        }
        if (req.method() === 'POST' && failPost && url.pathname === failPost.path) return json(400, { code: '23514', details: null, hint: null, message: failPost.message });
        if (req.method() === 'POST') return route.fulfill({ status: 201, headers: cors, body: '' });
        if (req.method() === 'DELETE') return route.fulfill({ status: 204, headers: cors });
        return json(404, {});
      });
      const p = await ctx.newPage();
      p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 200)}`); });
      p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 200)}`));
      if (signedIn) await p.addInitScript((s) => localStorage.setItem('sb-fake-ref-auth-token', JSON.stringify(s)), session());
      return { ctx, p, calls };
    };
    const open = async (p, city = 'Santiago') => { await p.goto(`${BASE}/ciudad?city=${encodeURIComponent(city)}`); await p.getByRole('tab', { name: 'Señales' }).click(); };

    // 1) Sin sesión: lectura pública, sin acciones
    { const { ctx, p } = await mkctx({ signedIn: false }); await open(p);
      await step(`[${name}] sin sesión: ve los reportes con su estado y sin botones de acción`, async () => {
        await p.getByText('Fila larga en el acceso').waitFor();
        assert.ok(await p.getByText('Corroborada', { exact: true }).count()); assert.ok(await p.getByText('Por confirmar', { exact: true }).count());
        assert.equal(await p.getByRole('button', { name: 'Lo confirmo' }).count(), 0);
        assert.ok(await p.getByRole('link', { name: 'Iniciar sesión' }).count());
      });
      await step(`[${name}] el reporte corroborado dice que NO es información oficial`, async () => {
        assert.match(await p.locator('li', { hasText: 'Acceso cortado por obras' }).innerText(), /3 personas distintas[\s\S]*no una fuente oficial/);
      });
      await step(`[${name}] el precio se rotula como observado por un viajero`, async () => {
        assert.match(await p.locator('li', { hasText: 'Menú del día' }).innerText(), /CLP[\s\S]*observado por un viajero/);
      });
      await step(`[${name}] sin desbordamiento horizontal`, async () => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true));
      await p.screenshot({ path: `${OUT}/pulsemesh-${name}-publico.png`, fullPage: true }); await ctx.close(); }

    // 2) Ciudad fuera del piloto
    { const { ctx, p, calls } = await mkctx({ signedIn: false }); await open(p, 'Buenos Aires');
      await step(`[${name}] ciudad fuera del piloto: lo dice y no consulta reportes`, async () => {
        await p.getByText(/en piloto en Santiago, São Paulo, Valparaíso/).waitFor();
        assert.equal(calls.filter((c) => c.p.includes('pulse_signals_public')).length, 0);
      }); await ctx.close(); }

    // 3) Vacío honesto
    { const { ctx, p } = await mkctx({ signedIn: false, rows: [] }); await open(p);
      await step(`[${name}] sin reportes: estado vacío honesto, nada simulado`, async () => {
        await p.getByText(/Todavía no hay reportes de viajeros en Santiago/).waitFor();
        assert.equal(await p.locator('ul li', { hasText: 'Fila' }).count(), 0);
      }); await ctx.close(); }

    // 4) Con sesión: reportar, confirmar, contradecir, marcar, borrar
    { const { ctx, p, calls } = await mkctx({ signedIn: true, geo: true }); await open(p, 'Valparaíso');
      await p.getByRole('button', { name: 'Reportar algo' }).waitFor();
      await step(`[${name}] con sesión: tu reporte muestra «Borrar» y los ajenos «Lo confirmo»`, async () => {
        assert.ok(await p.locator('li', { hasText: 'Menú del día' }).getByRole('button', { name: 'Borrar' }).count());
        assert.ok(await p.locator('li', { hasText: 'Fila larga' }).getByRole('button', { name: 'Lo confirmo' }).count());
        assert.equal(await p.locator('li', { hasText: 'Menú del día' }).getByRole('button', { name: 'Lo confirmo' }).count(), 0);
      });
      await step(`[${name}] título demasiado corto: avisa y no envía nada`, async () => {
        await p.getByRole('button', { name: 'Reportar algo' }).click();
        await p.getByLabel('Título breve').fill('ab'); await p.getByRole('button', { name: 'Enviar reporte' }).click();
        assert.match(await p.locator('[role=alert]').filter({ hasText: /título/i }).first().innerText(), /al menos 3/);
        assert.equal(calls.filter((c) => c.m === 'POST' && c.p.endsWith('pulse_signals')).length, 0);
      });
      await step(`[${name}] reporte válido con ubicación: se envía a la ciudad correcta y a ~1 km`, async () => {
        await p.getByLabel('Título breve').fill('Mucha gente en el ascensor'); await p.getByLabel(/Incluir mi ubicación/).check();
        await p.getByRole('button', { name: 'Enviar reporte' }).click(); await p.getByText(/Reporte enviado/).waitFor();
        const post = calls.find((c) => c.m === 'POST' && c.p.endsWith('/pulse_signals'));
        assert.equal(post.body.city_key, 'valparaiso-cl'); assert.equal(post.body.user_id, USER.id);
        assert.equal(post.body.category, 'afluencia'); assert.equal(post.body.lat_approx, -33.05); assert.equal(post.body.lon_approx, -71.62);
        for (const k of ['expires_at', 'flags', 'hidden', 'id']) assert.ok(!(k in post.body), `no debe enviar ${k}`);
      });
      await step(`[${name}] precios: envía monto y moneda de la ciudad`, async () => {
        await p.getByRole('button', { name: 'Reportar algo' }).click();
        await p.getByLabel('Categoría').selectOption('precios'); await p.getByLabel('Título breve').fill('Completo en el centro');
        await p.getByLabel(/Precio observado/).fill('3.500'.replace('.', '')); await p.getByRole('button', { name: 'Enviar reporte' }).click(); await p.getByText(/Reporte enviado/).waitFor();
        const posts = calls.filter((c) => c.m === 'POST' && c.p.endsWith('/pulse_signals')); const last = posts[posts.length - 1].body;
        assert.equal(last.price_amount, 3500); assert.equal(last.price_currency, 'CLP'); assert.equal(last.lat_approx, null);
      });
      await step(`[${name}] confirmar y contradecir envían el veredicto con tu id`, async () => {
        await p.locator('li', { hasText: 'Fila larga' }).getByRole('button', { name: 'Lo confirmo' }).click(); await p.getByText(/registramos tu confirmación/).waitFor();
        await p.locator('li', { hasText: 'Acceso cortado' }).getByRole('button', { name: 'No es así' }).click(); await p.getByText(/no coincide/).waitFor();
        const conf = calls.filter((c) => c.p.endsWith('pulse_confirmations'));
        assert.deepEqual(conf.map((c) => [c.body.signal_id, c.body.verdict, c.body.user_id]), [['s1', 'confirma', USER.id], ['s2', 'contradice', USER.id]]);
      });
      await step(`[${name}] marcar un reporte envía el motivo`, async () => {
        const li = p.locator('li', { hasText: 'Fila larga' }); await li.locator('summary').click(); await li.getByRole('button', { name: 'Es falso' }).click(); await p.getByText(/lo revisaremos/).waitFor();
        assert.equal(calls.find((c) => c.p.endsWith('pulse_flags')).body.reason, 'falso');
      });
      await step(`[${name}] borrar tu reporte llama a DELETE con su id`, async () => {
        await p.locator('li', { hasText: 'Menú del día' }).getByRole('button', { name: 'Borrar' }).click(); await p.getByText(/Reporte borrado/).waitFor();
        const del = calls.find((c) => c.m === 'DELETE'); assert.match(del.q, /id=eq\.s3/);
      });
      await p.screenshot({ path: `${OUT}/pulsemesh-${name}-sesion.png`, fullPage: true }); await ctx.close(); }

    // 5) Errores de la base se traducen
    { const { ctx, p } = await mkctx({ signedIn: true, failPost: { path: '/rest/v1/pulse_signals', message: 'Límite diario de reportes alcanzado' } }); await open(p);
      await step(`[${name}] límite diario: mensaje claro, el formulario no se pierde`, async () => {
        await p.getByRole('button', { name: 'Reportar algo' }).click(); await p.getByLabel('Título breve').fill('Otro reporte más');
        await p.getByRole('button', { name: 'Enviar reporte' }).click();
        await p.getByText(/límite de 20 reportes por día/).waitFor(); assert.equal(await p.getByLabel('Título breve').inputValue(), 'Otro reporte más');
      }); await ctx.close(); }
    { const { ctx, p } = await mkctx({ signedIn: true, failPost: { path: '/rest/v1/pulse_confirmations', message: 'No puedes confirmar tu propio reporte' } }); await open(p);
      await step(`[${name}] error al confirmar: se muestra el motivo`, async () => {
        await p.locator('li', { hasText: 'Fila larga' }).getByRole('button', { name: 'Lo confirmo' }).click(); await p.getByText(/No puedes confirmar tu propio reporte/).waitFor();
      }); await ctx.close(); }
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola (incluida la política de seguridad)' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
