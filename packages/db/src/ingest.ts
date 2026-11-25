import type { NormalizedEvent } from '@pulse/shared';
import type { Sql } from './client';
import { insertEvents } from './insert';
import { rollupInserted } from './rollups';

export async function ingestEvents(sql: Sql, projectId: string, events: NormalizedEvent[]) {
  if (events.length === 0) return { accepted: 0, duplicates: 0 };
  const ids = await sql.begin(async (tx) => {
    const db = tx as unknown as Sql;
    const inserted = await insertEvents(db, events.map((event) => ({ ...event, projectId })));
    await rollupInserted(db, inserted);
    return inserted;
  });
  return { accepted: ids.length, duplicates: events.length - ids.length };
}
