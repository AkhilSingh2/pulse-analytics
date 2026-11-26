import { PGlite } from '@electric-sql/pglite';
import { generateTraffic } from '@pulse/db/generate';
import { insertEvents } from '@pulse/db/insert';
import { rebuildRollups } from '@pulse/db/rollups';
import type { Sql } from '@pulse/db/client';
import { createSql } from './sql';

export type Warehouse = { sql: Sql; projectId: string };

/**
 * Boots an in-browser Postgres (PGlite), applies the real migration, and seeds it
 * with the same synthetic Northstar traffic the CLI seed uses.
 */
export async function bootWarehouse(schema: string, profile = { days: 68, dailyVisitors: 100 }): Promise<Warehouse> {
  const db = await PGlite.create();
  // gen_random_uuid is built in; pgcrypto is not needed in the browser.
  await db.exec(schema.replace(/create extension[^;]*;/gi, ''));
  const sql = createSql(db);
  const created = (await sql`
    insert into projects (name, slug, api_key)
    values ('Northstar', 'northstar', 'pulse_live_demo_northstar')
    returning id
  `) as { id: string }[];
  const projectId = created[0]!.id;
  const events = generateTraffic({ ...profile, seed: 2211, asOf: new Date() });
  await insertEvents(
    sql,
    events.map((event) => ({ ...event, projectId })),
  );
  await rebuildRollups(sql, projectId);
  return { sql, projectId };
}
