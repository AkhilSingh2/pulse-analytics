export type RateDecision = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

type Bucket = { tokens: number; updated: number };

/**
 * In-process token bucket. One Next.js server shares it; a multi-instance
 * deploy would move the same math to Redis. Capacity is in events, not requests.
 */
export class TokenBucket {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string, cost = 1): RateDecision {
    const timestamp = this.now();
    this.prune(timestamp);
    const current = this.buckets.get(key) ?? { tokens: this.capacity, updated: timestamp };
    const elapsed = Math.max(0, timestamp - current.updated);
    current.tokens = Math.min(this.capacity, current.tokens + elapsed * this.refillPerMs);
    current.updated = timestamp;
    if (current.tokens >= cost) {
      current.tokens -= cost;
      this.buckets.set(key, current);
      return { ok: true, remaining: Math.floor(current.tokens), retryAfterMs: 0 };
    }
    this.buckets.set(key, current);
    const retryAfterMs = Math.ceil((cost - current.tokens) / this.refillPerMs);
    return { ok: false, remaining: Math.floor(current.tokens), retryAfterMs };
  }

  private prune(now: number) {
    if (this.buckets.size < 2000) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updated > 60_000) this.buckets.delete(key);
    }
  }
}
