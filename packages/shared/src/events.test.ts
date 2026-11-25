import { describe, expect, it } from 'vitest';
import { clampTimestamp, eventInputSchema, formatZodIssues, ingestBodySchema, normalizeEvent } from './events';
import { channelFromReferrer, referrerHost } from './referrer';
import { csvCell, formatDuration } from './format';
import { fillBuckets } from './time';

describe('event schema', () => {
  const valid = {
    name: 'page_view',
    anonymousId: 'anon_demo1234',
    sessionId: 'ses_demo1234',
    path: '/pricing',
    referrer: 'https://www.google.com/search?q=northstar',
    device: 'mobile' as const,
    country: 'IN',
    properties: { title: 'Pricing' },
  };

  it('accepts a batch and rejects an empty one', () => {
    expect(ingestBodySchema.safeParse({ events: [valid] }).success).toBe(true);
    const empty = ingestBodySchema.safeParse({ events: [] });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(formatZodIssues(empty.error)[0]).toContain('events');
  });

  it('rejects nested properties and oversized names', () => {
    expect(eventInputSchema.safeParse({ ...valid, name: '1bad' }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...valid, properties: { plan: { tier: 'pro' } } }).success,
    ).toBe(false);
  });

  it('derives channel and host, and clamps future timestamps', () => {
    const now = Date.parse('2026-11-25T12:00:00.000Z');
    const event = normalizeEvent(
      { ...valid, timestamp: '2026-11-25T12:30:00.000Z' },
      { now },
    );
    expect(event.channel).toBe('google');
    expect(event.referrerHost).toBe('google.com');
    expect(event.occurredAt.toISOString()).toBe('2026-11-25T12:05:00.000Z');
    expect(channelFromReferrer(null)).toBe('direct');
    expect(referrerHost('not a url')).toBe('(direct)');
  });

  it('clamps events older than seven days', () => {
    const now = Date.parse('2026-11-25T12:00:00.000Z');
    const clamped = clampTimestamp('2026-01-01T00:00:00.000Z', now);
    expect(clamped.getTime()).toBe(now - 7 * 24 * 60 * 60 * 1000);
  });
});

describe('format and buckets', () => {
  it('guards spreadsheet formulas in csv cells', () => {
    expect(csvCell('=cmd')).toBe("'=cmd");
    expect(csvCell('hello, world')).toBe('"hello, world"');
  });

  it('formats durations and fills empty hours', () => {
    expect(formatDuration(90_000)).toBe('2m');
    expect(formatDuration(null)).toBe('—');
    const from = new Date('2026-11-25T10:15:00.000Z');
    const to = new Date('2026-11-25T12:15:00.000Z');
    const filled = fillBuckets(
      [{ bucket: '2026-11-25T11:00:00.000Z', events: 4, users: 2 }],
      from,
      to,
      'hour',
    );
    expect(filled.map((point) => point.events)).toEqual([0, 4, 0]);
  });
});
