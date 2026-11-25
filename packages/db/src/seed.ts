import { getSql } from './client';
import { generateTraffic } from './generate';
import { insertEvents } from './insert';
import { rebuildRollups } from './rollups';

const PROFILES = {
  small: { days: 14, dailyVisitors: 36 },
  demo: { days: 68, dailyVisitors: 100 },
} as const;

export async function seed() {
  const sql = getSql();
  const apiKey = process.env.PULSE_API_KEY || 'pulse_live_demo_northstar';
  const profile = process.env.SEED_PROFILE === 'small' ? PROFILES.small : PROFILES.demo;
  const existing = await sql<{ id: string }[]>`select id from projects where slug = 'northstar'`;
  let projectId = existing[0]?.id;
  if (!projectId) {
    const created = await sql<{ id: string }[]>`
      insert into projects (name, slug, api_key)
      values ('Northstar', 'northstar', ${apiKey})
      returning id
    `;
    projectId = created[0]!.id;
  } else {
    await sql`update projects set api_key = ${apiKey}, name = 'Northstar' where id = ${projectId}`;
  }
  const countRows = await sql<{ n: number }[]>`
    select count(*)::int as n from events where project_id = ${projectId}
  `;
  const existingEvents = Number(countRows[0]?.n ?? 0);
  if (existingEvents > 0 && process.env.SEED_FORCE !== '1') {
    console.log(`seed skipped (${existingEvents} events already stored). SEED_FORCE=1 rebuilds them.`);
    return { projectId, inserted: 0, skipped: true };
  }
  if (existingEvents > 0) {
    await sql`delete from events where project_id = ${projectId}`;
    await sql`delete from rollup_hourly where project_id = ${projectId}`;
    await sql`delete from rollup_page_daily where project_id = ${projectId}`;
    await sql`delete from rollup_referrer_daily where project_id = ${projectId}`;
  }
  const events = generateTraffic({ ...profile, seed: 2211, asOf: new Date() });
  console.log(`inserting ${events.length} synthetic events`);
  await insertEvents(
    sql,
    events.map((event) => ({ ...event, projectId: projectId! })),
  );
  await rebuildRollups(sql, projectId);
  await sql`analyze events, rollup_hourly, rollup_page_daily, rollup_referrer_daily`;
  console.log('seed complete');
  return { projectId, inserted: events.length, skipped: false };
}
