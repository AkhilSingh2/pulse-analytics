import { computeFunnel } from '@pulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeSql, getSql, type Sql } from './client';
import { ingestEvents } from './ingest';
import { migrate } from './migrate';
import { getFunnel, getOverview } from './queries';
import { rebuildRollups } from './rollups';

const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite('postgres analytics', () => {
  let sql: Sql;
  let projectId = '';

  beforeAll(async () => {
    sql = getSql();
    await migrate();
    const slug = `test_${crypto.randomUUID().slice(0, 8)}`;
    const created = await sql<{ id: string }[]>`
      insert into projects (name, slug, api_key)
      values ('Fixture', ${slug}, ${`key_${slug}`})
      returning id
    `;
    projectId = created[0]!.id;
    const week = Date.parse('2026-11-20T10:00:00.000Z');
    const later = Date.parse('2026-11-24T11:00:00.000Z');
    const base = {
      projectId,
      referrer: 'https://www.google.com/search?q=northstar',
      referrerHost: 'google.com',
      channel: 'google' as const,
      country: 'US',
      device: 'desktop' as const,
      properties: {},
    };
    await ingestEvents(sql, projectId, [
      event({ ...base, name: 'page_view', anonymousId: 'anon_aaaa1111', sessionId: 'ses_aaaa1111', at: week, path: '/pricing' }),
      event({ ...base, name: 'signup_started', anonymousId: 'anon_aaaa1111', sessionId: 'ses_aaaa1111', at: week + 60_000, path: '/signup' }),
      event({ ...base, name: 'signup_completed', anonymousId: 'anon_aaaa1111', userId: 'user_aaaa', sessionId: 'ses_aaaa1111', at: week + 120_000, path: '/signup' }),
      event({ ...base, name: 'feature_used', anonymousId: 'anon_aaaa1111', userId: 'user_aaaa', sessionId: 'ses_aaaa2222', at: later, path: '/app/boards' }),
      event({
        ...base,
        name: 'page_view',
        anonymousId: 'anon_bbbb2222',
        sessionId: 'ses_bbbb2222',
        at: week + 5_000,
        path: '/',
        device: 'mobile',
        country: 'IN',
        channel: 'direct',
        referrer: null,
        referrerHost: '(direct)',
      }),
      event({
        ...base,
        name: 'signup_started',
        anonymousId: 'anon_bbbb2222',
        sessionId: 'ses_bbbb2222',
        at: week + 20_000,
        path: '/signup',
        device: 'mobile',
        country: 'IN',
        channel: 'direct',
        referrer: null,
        referrerHost: '(direct)',
      }),
      event({ ...base, name: 'page_view', anonymousId: 'anon_cccc3333', sessionId: 'ses_cccc3333', at: later, path: '/docs' }),
    ]);
  });

  afterAll(async () => {
    if (projectId) await sql`delete from projects where id = ${projectId}`;
    await closeSql();
  });

  it('matches the tested funnel and honors a device segment', async () => {
    const all = await getFunnel(sql, projectId, { preset: '30d' }, ['page_view', 'signup_started', 'signup_completed']);
    expect(all.steps.map((step) => step.users)).toEqual([3, 2, 1]);
    const mobile = await getFunnel(
      sql,
      projectId,
      { preset: '30d', device: 'mobile' },
      ['page_view', 'signup_started', 'signup_completed'],
    );
    expect(mobile.steps.map((step) => step.users)).toEqual([1, 1, 0]);
    const direct = computeFunnel(
      [
        { actor: 'anon_bbbb2222', name: 'page_view', ts: 1 },
        { actor: 'anon_bbbb2222', name: 'signup_started', ts: 2 },
      ],
      ['page_view', 'signup_started', 'signup_completed'],
    );
    expect(direct.map((step) => step.users)).toEqual(mobile.steps.map((step) => step.users));
  });

  it('keeps hourly rollup totals equal to raw event counts', async () => {
    await rebuildRollups(sql, projectId);
    const raw = await sql<{ n: number }[]>`select count(*)::int as n from events where project_id = ${projectId}`;
    const rolled = await sql<{ n: number }[]>`
      select coalesce(sum(event_count), 0)::int as n from rollup_hourly where project_id = ${projectId}
    `;
    expect(Number(rolled[0]?.n)).toBe(Number(raw[0]?.n));
    const duplicate = await ingestEvents(sql, projectId, [
      event({
        projectId,
        name: 'page_view',
        anonymousId: 'anon_aaaa1111',
        sessionId: 'ses_aaaa1111',
        at: Date.parse('2026-11-20T10:00:00.000Z'),
        path: '/pricing',
        referrer: 'https://www.google.com/search?q=northstar',
        referrerHost: 'google.com',
        channel: 'google',
        country: 'US',
        device: 'desktop',
        properties: {},
        clientEventId: '11111111-1111-4111-8111-111111111111',
      }),
    ]);
    const again = await ingestEvents(sql, projectId, [
      event({
        projectId,
        name: 'page_view',
        anonymousId: 'anon_aaaa1111',
        sessionId: 'ses_aaaa1111',
        at: Date.parse('2026-11-20T10:00:00.000Z'),
        path: '/pricing',
        referrer: 'https://www.google.com/search?q=northstar',
        referrerHost: 'google.com',
        channel: 'google',
        country: 'US',
        device: 'desktop',
        properties: {},
        clientEventId: '11111111-1111-4111-8111-111111111111',
      }),
    ]);
    expect(duplicate.accepted).toBe(1);
    expect(again.duplicates).toBe(1);
    const overview = await getOverview(sql, projectId, { preset: '30d' }, new Date('2026-11-25T12:00:00.000Z'));
    expect(overview.kpis.visitors.value).toBeGreaterThan(0);
  });
});

function event(input: {
  projectId?: string;
  name: string;
  anonymousId: string;
  userId?: string | null;
  sessionId: string;
  at: number;
  path: string;
  referrer: string | null;
  referrerHost: string;
  channel: 'google' | 'direct';
  country: string;
  device: 'desktop' | 'mobile';
  properties: Record<string, string>;
  clientEventId?: string;
}) {
  return {
    clientEventId: input.clientEventId ?? crypto.randomUUID(),
    name: input.name,
    anonymousId: input.anonymousId,
    userId: input.userId ?? null,
    sessionId: input.sessionId,
    occurredAt: new Date(input.at),
    path: input.path,
    referrer: input.referrer,
    referrerHost: input.referrerHost,
    channel: input.channel,
    country: input.country,
    device: input.device,
    properties: input.properties,
  };
}
