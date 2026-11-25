import { describe, expect, it } from 'vitest';
import { PulseClient, memoryStorage } from './client';

function harness(options?: { maxBatchSize?: number; now?: () => number }) {
  const sent: Array<{ events: Array<{ name: string; anonymousId: string; userId?: string; sessionId: string; path?: string }> }> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
  };
  const storage = memoryStorage();
  const sessions = memoryStorage();
  const pulse = new PulseClient({
    apiKey: 'pulse_test',
    endpoint: 'http://example.test/api/ingest',
    flushIntervalMs: 60_000,
    maxBatchSize: options?.maxBatchSize ?? 10,
    storage,
    sessionStorage: sessions,
    fetch: fetchImpl,
    now: options?.now,
  });
  return { pulse, sent, storage };
}

describe('PulseClient', () => {
  it('batches when the queue fills and keeps a stable anonymous id', async () => {
    const { pulse, sent, storage } = harness({ maxBatchSize: 2 });
    pulse.track('page_view', { path: '/pricing' });
    pulse.track('signup_started', { path: '/signup' });
    await pulse.flush();
    pulse.track('signup_completed');
    await pulse.flush();
    expect(sent).toHaveLength(2);
    expect(sent[0]?.events).toHaveLength(2);
    expect(sent[0]?.events[0]?.path).toBe('/pricing');
    expect(sent[0]?.events[0]?.anonymousId).toBe(sent[1]?.events[0]?.anonymousId);
    expect(storage.getItem('pulse_anonymous_id')).toBe(sent[0]?.events[0]?.anonymousId);
  });

  it('attaches the identified user and rotates stale sessions', async () => {
    let now = 1_700_000_000_000;
    const { pulse, sent } = harness({ now: () => now });
    pulse.identify('user_123', { plan: 'pro' });
    await pulse.flush();
    const firstSession = sent[0]?.events[0]?.sessionId;
    expect(sent[0]?.events[0]?.name).toBe('identify');
    expect(sent[0]?.events[0]?.userId).toBe('user_123');
    now += 31 * 60 * 1000;
    pulse.track('feature_used');
    await pulse.flush();
    expect(sent[1]?.events[0]?.userId).toBe('user_123');
    expect(sent[1]?.events[0]?.sessionId).not.toBe(firstSession);
  });

  it('lets a caller override identity for simulated traffic', async () => {
    const { pulse, sent } = harness();
    pulse.track('page_view', { path: '/', country: 'IN', device: 'mobile' }, {
      anonymousId: 'anon_override1',
      userId: null,
      sessionId: 'ses_override1',
    });
    await pulse.flush();
    expect(sent[0]?.events[0]).toMatchObject({
      anonymousId: 'anon_override1',
      sessionId: 'ses_override1',
      country: 'IN',
      device: 'mobile',
    });
    expect(sent[0]?.events[0]?.userId).toBeUndefined();
  });
});
