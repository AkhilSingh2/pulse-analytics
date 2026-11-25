import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rate-limit';

describe('TokenBucket', () => {
  it('rejects a burst past capacity and refills over time', () => {
    let now = 1_000;
    const bucket = new TokenBucket(10, 1 / 1000, () => now);
    expect(bucket.take('demo', 10).ok).toBe(true);
    const denied = bucket.take('demo', 1);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);
    now += 500;
    expect(bucket.take('demo', 1).ok).toBe(false);
    now += 500;
    expect(bucket.take('demo', 1).ok).toBe(true);
  });

  it('keeps keys independent', () => {
    const bucket = new TokenBucket(1, 0, () => 0);
    expect(bucket.take('a', 1).ok).toBe(true);
    expect(bucket.take('b', 1).ok).toBe(true);
    expect(bucket.take('a', 1).ok).toBe(false);
  });
});
