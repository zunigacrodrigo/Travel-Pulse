// E2E de la cuenta (Supabase simulado en Playwright; no toca ningún proyecto real).
// Compilar con: NEXT_PUBLIC_SUPABASE_URL=https://fake-ref.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt anon falso> npm run build
// Servidor: PORT=3102 ... node .next/standalone/server.js   ·   Ejecutar: node qa/e2e-cuenta.js
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
const DNA = { version: 1, updatedAt: '2026-10-30T10:00:00.000Z', origin: 'SCL', budgetUsd: 1500, days: 8, travelers: 1, flexibleDates: true, interests: ['aventura'], pace: null };
const SAVED = [{ destinationId: 'CUZ', name: 'Cusco', code: 'CUZ', score: 71, totalUsd: 900, savedAt: '2026-10-30T10:00:00.000Z', request: { origin: 'SCL', budgetUsd: 1500, days: 8, month: 11, flexibleDates: false, travelers: 1, interests: [] } }];

(async () => {
  const browser = await chromium.launch();
  for (const [name, w, h] of [['movil', 390, 844], ['escritorio', 1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'es-CL' });
    const calls = [];
    await ctx.route(`${HOST}/**`, async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const body = req.postData();
      calls.push({ m: req.method(), p: url.pathname, body: body ? JSON.parse(body) : null });
      const json = (status, data) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
      if (url.pathname === '/auth/v1/otp') return json(200, {});
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname === '/rest/v1/profiles') return req.method() === 'GET' ? json(200, [{ dna: null }]) : json(200, [{ id: USER.id }]);
      if (url.pathname === '/rest/v1/saved_destinations') return req.method() === 'GET' ? json(200, []) : json(201, []);
      if (url.pathname === '/rest/v1/user_trips') return req.method() === 'GET' ? json(200, []) : json(201, []);
      if (url.pathname === '/rest/v1/rpc/delete_my_cloud_data') return json(200, null);
      return json(404, {});
    });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 200)}`); });
    p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 200)}`));
    await p.addInitScript(([dna, saved]) => { if (!localStorage.getItem('tp-dna')) { localStorage.setItem('tp-dna', JSON.stringify(dna)); localStorage.setItem('tp-saved', JSON.stringify(saved)); } }, [DNA, SAVED]);

    await p.goto(BASE + '/cuenta');
    await step(`[${name}] sin sesión: muestra el formulario de correo`, async () => { await p.getByLabel('Tu correo').waitFor(); });
    await step(`[${name}] correo inválido: error accesible y sin llamadas a la nube`, async () => {
      await p.getByLabel('Tu correo').fill('no-es-correo'); await p.getByRole('button', { name: /Enviarme/ }).click();
      assert.match(await p.locator('main [role=alert]').textContent(), /correo válido/);
      assert.equal(calls.filter((c) => c.p === '/auth/v1/otp').length, 0);
    });
    await step(`[${name}] correo válido: pide el enlace y lo informa`, async () => {
      await p.getByLabel('Tu correo').fill('viajera@example.com'); await p.getByRole('button', { name: /Enviarme/ }).click();
      await p.getByText(/Te enviamos un enlace/).waitFor();
      assert.equal(calls.find((c) => c.p === '/auth/v1/otp').body.email, 'viajera@example.com');
    });
    await step(`[${name}] con sesión: sincroniza solo al entrar y sube DNA y guardados`, async () => {
      await p.evaluate((s) => localStorage.setItem('sb-fake-ref-auth-token', JSON.stringify(s)), session());
      await p.reload(); await p.getByText(/Sesión iniciada como/).waitFor();
      await p.getByText(/Travel DNA subido/).waitFor();
      const patch = calls.find((c) => c.m === 'PATCH' && c.p === '/rest/v1/profiles');
      assert.equal(patch.body.dna.interests[0], 'aventura'); assert.equal(patch.body.dna_updated_at, DNA.updatedAt);
      const up = calls.find((c) => c.m === 'POST' && c.p === '/rest/v1/saved_destinations');
      assert.equal(up.body[0].destination_id, 'CUZ'); assert.equal(up.body[0].user_id, USER.id);
    });
    await step(`[${name}] sin viaje propio no se sube ningún viaje`, async () => {
      assert.equal(calls.filter((c) => c.p === '/rest/v1/user_trips' && c.m !== 'GET').length, 0);
    });
    await step(`[${name}] sin errores de sincronización visibles`, async () => {
      assert.equal(await p.getByText(/Sincronización parcial/).count(), 0);
    });
    await p.screenshot({ path: `${OUT}/cuenta-${name}.png`, fullPage: true });
    await step(`[${name}] borrar datos pide confirmación y llama a la función`, async () => {
      await p.getByRole('button', { name: 'Borrar mis datos en la nube' }).click();
      await p.getByRole('alertdialog').waitFor();
      assert.equal(calls.filter((c) => c.p.endsWith('delete_my_cloud_data')).length, 0);
      await p.getByRole('button', { name: 'Sí, borrar' }).click();
      await p.getByText(/Borramos tus datos de la nube/).waitFor();
      assert.equal(calls.filter((c) => c.p.endsWith('delete_my_cloud_data')).length, 1);
      assert.ok(await p.evaluate(() => !!localStorage.getItem('tp-dna')), 'lo local debe conservarse');
    });
    await step(`[${name}] cerrar sesión vuelve al formulario`, async () => {
      await p.getByRole('button', { name: 'Cerrar sesión' }).click(); await p.getByLabel('Tu correo').waitFor();
    });
    await step(`[${name}] sin desbordamiento horizontal`, async () => {
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    });
    await ctx.close();
  }
  await browser.close();
  results.push([errors.length ? 'FAIL' : 'PASS', 'sin errores de consola (incluida la política de seguridad)' + (errors.length ? ': ' + errors.join(' | ') : '')]);
  for (const [s, n] of results) console.log(s, n);
  const f = results.filter(([s]) => s === 'FAIL').length; console.log(`${results.length - f}/${results.length}`); process.exit(f ? 1 : 0);
})();
