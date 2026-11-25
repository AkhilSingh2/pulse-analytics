import { RATE_LIMIT, TokenBucket } from '@pulse/shared';

const globalLimiter = globalThis as unknown as { __pulseLimit?: TokenBucket };

export function limiter() {
  globalLimiter.__pulseLimit ??= new TokenBucket(RATE_LIMIT.capacity, RATE_LIMIT.refillPerSecond / 1000);
  return globalLimiter.__pulseLimit;
}
