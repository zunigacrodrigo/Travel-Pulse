// Crea un viaje por el camino real del viajero: pega un plan en /importar y lo guarda.
// Lo ÚNICO simulado es la respuesta de /api/live-data (geocodificación): devuelve el centro real de São Paulo
// y su zona horaria, para que la prueba no dependa de Nominatim/Open-Meteo. No es dato de producto.
// Las paradas con hora son de horario fijo (no se cancelan); las que no la traen sí se pueden mover y cancelar.
const TEXT = `Día 1 - 5 nov
10:00 Mercado Municipal de São Paulo (90 min)
Almuerzo en Liberdade US$15
Museu de Arte de São Paulo (2 h)
Paseo por la Avenida Paulista
19:30 Cena en Kidoairaku US$30`;

async function seedPlan(page, base) {
  await page.route('**/api/live-data**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, coordinates: { lat: -23.5614, lon: -46.6559 }, weather: { timezone: 'America/Sao_Paulo' }, city: 'São Paulo', country: 'Brasil' }),
  }));
  await page.goto(base + '/importar');
  await page.fill('#imp-text', TEXT);
  await page.fill('#imp-city', 'São Paulo, Brasil');
  await page.fill('#imp-date', '2026-11-05');
  await page.getByRole('button', { name: 'Interpretar itinerario' }).click();
  await page.getByRole('button', { name: 'Guardar y abrir en Trip Twin' }).click();
  await page.waitForSelector('.tt-timeline-item');
}
module.exports = { seedPlan, TEXT };
