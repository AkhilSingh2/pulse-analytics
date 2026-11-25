import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const path of candidates) {
    if (!existsSync(/*turbopackIgnore: true*/ path)) continue;
    for (const line of readFileSync(/*turbopackIgnore: true*/ path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
    return;
  }
}

loadEnvFile();

type SqlClient = ReturnType<typeof postgres>;

const globalSql = globalThis as unknown as { __pulseSql?: SqlClient };

export function getSql(): SqlClient {
  if (!globalSql.__pulseSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalSql.__pulseSql = postgres(url, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 15,
      infer: true,
      connection: { TimeZone: 'UTC' },
      onnotice: () => {},
    });
  }
  return globalSql.__pulseSql;
}

export async function closeSql() {
  if (!globalSql.__pulseSql) return;
  await globalSql.__pulseSql.end({ timeout: 5 });
  globalSql.__pulseSql = undefined;
}

export type Sql = SqlClient;
