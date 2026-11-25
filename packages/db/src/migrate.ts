import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSql } from './client';

export async function migrate() {
  const sql = getSql();
  const path = fileURLToPath(new URL('../migrations/001_init.sql', import.meta.url));
  const script = readFileSync(path, 'utf8');
  await sql.unsafe(script);
}

export async function waitForDatabase(attempts = 30) {
  const sql = getSql();
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw last instanceof Error ? last : new Error('database unavailable');
}
