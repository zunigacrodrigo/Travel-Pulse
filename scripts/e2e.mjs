// Ejecuta los E2E de qa/ contra un servidor de producción real. Uso: npm run e2e
// Grupo 1: compilación normal. Grupo 2: compilación con claves de Supabase FALSAS (solo para probar la interfaz
// de cuenta y PulseMesh contra un servidor simulado dentro de cada prueba; no toca ninguna base real).
// El Radar (qa/e2e-radar.js) necesita dos servidores y fuentes simuladas: ver el encabezado de ese archivo.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3102";
const BASE = `http://127.0.0.1:${PORT}`;
const FAKE_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake";
const groups = [
  { name: "base", env: {}, files: ["qa/e2e-dia.js", "qa/e2e-dna-whatif.js", "qa/e2e-trip-twin-undo.js", "qa/e2e-visual-radar-budget.js", "qa/e2e-sin-demo.js"] },
  { name: "nube simulada", env: { NEXT_PUBLIC_SUPABASE_URL: "https://fake-ref.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_JWT }, files: ["qa/e2e-cuenta.js", "qa/e2e-pulsemesh.js"] },
];

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + "/")).ok) return true; } catch { /* aún no */ }
    await sleep(1000);
  }
  return false;
}

let failed = 0;
for (const g of groups) {
  console.log(`\n=== Grupo: ${g.name} ===`);
  const env = { ...process.env, ...g.env };
  if (run("npm", ["run", "build"], { env }).status !== 0) { console.error("Falló la compilación."); process.exit(1); }
  run("sh", ["-c", "cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/"]);
  const server = spawn("node", [".next/standalone/server.js"], { env: { ...env, PORT, HOSTNAME: "127.0.0.1", RATE_LIMIT_DISABLED: "1" }, stdio: "ignore" });
  try {
    if (!(await waitUp())) { console.error("El servidor no arrancó."); failed++; continue; }
    for (const f of g.files) {
      if (!existsSync(f)) { console.error(`Falta ${f}`); failed++; continue; }
      const r = run("node", [f], { env: { ...env, BASE } });
      if (r.status !== 0) { console.error(`FALLÓ ${f}`); failed++; }
    }
  } finally { server.kill(); await sleep(500); }
}
console.log(failed ? `\n${failed} fallo(s).` : "\nTodos los E2E pasaron.");
process.exit(failed ? 1 : 0);
