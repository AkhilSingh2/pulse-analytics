import { channelFromReferrer, computeFunnel, startOfIsoWeekUTC, WEEK_MS, buildRetention } from '@pulse/shared';
import { describe, expect, it } from 'vitest';
import { generateTraffic } from './generate';

describe('generateTraffic', () => {
  const events = generateTraffic({
    days: 28,
    dailyVisitors: 40,
    seed: 2211,
    asOf: new Date('2026-11-25T15:00:00.000Z'),
  });

  it('builds a monotonic acquisition funnel and coherent channels', () => {
    expect(events.length).toBeGreaterThan(500);
    const funnel = computeFunnel(
      events.map((event) => ({
        actor: event.anonymousId,
        name: event.name,
        ts: event.occurredAt.getTime(),
      })),
      ['page_view', 'signup_started', 'signup_completed', 'feature_used', 'subscription_started'],
    );
    for (let index = 1; index < funnel.length; index += 1) {
      expect(funnel[index]!.users).toBeLessThanOrEqual(funnel[index - 1]!.users);
    }
    expect(funnel[0]!.users).toBeGreaterThan(funnel[4]!.users);
    expect(funnel[4]!.users).toBeGreaterThan(0);
    for (const event of events.slice(0, 200)) {
      expect(event.channel).toBe(channelFromReferrer(event.referrer));
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(Date.parse('2026-11-25T15:00:00.000Z'));
    }
  });

  it('gives every cohort a full first period', () => {
    const byActor = new Map<string, number[]>();
    for (const event of events) {
      const week = startOfIsoWeekUTC(event.occurredAt.getTime());
      const list = byActor.get(event.anonymousId) ?? [];
      list.push(week);
      byActor.set(event.anonymousId, list);
    }
    const rows = buildRetention(
      [...byActor.entries()].map(([actor, periods]) => ({ actor, periods })),
      { periodMs: WEEK_MS, maxPeriods: 6, asOf: Date.parse('2026-11-25T15:00:00.000Z') },
    );
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) expect(row.cells[0]?.rate).toBe(1);
  });
});
