#!/usr/bin/env node
// Une las migraciones de supabase/migrations en UN archivo (supabase/setup-completo.sql) para pegarlo una sola vez en el SQL Editor de Supabase.
// Uso: npm run nube:sql   (una prueba comprueba que el archivo generado esté al día con las migraciones).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildSetupSql(dir = join(root, "supabase", "migrations")) {
  const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const header = `-- Travel Pulse · instalación completa en Supabase (migraciones ${files[0].slice(0, 4)}–${files.at(-1).slice(0, 4)}).\n-- GENERADO por scripts/build-setup-sql.mjs: no lo edites; cambia las migraciones y vuelve a generarlo (npm run nube:sql).\n-- Pégalo ENTERO en Supabase → SQL Editor → New query → Run, UNA sola vez y en un proyecto nuevo (verificado en un Postgres limpio).\n-- NO es repetible: una segunda ejecución falla con «relation already exists». Si algo sale mal, corre «npm run preflight» para ver qué quedó aplicado.\n`;
  return header + files.map((f) => `\n-- ===================== ${f} =====================\n${readFileSync(join(dir, f), "utf8").trimEnd()}\n`).join("");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = buildSetupSql();
  writeFileSync(join(root, "supabase", "setup-completo.sql"), sql);
  console.log(`supabase/setup-completo.sql escrito (${sql.length} caracteres).`);
}
