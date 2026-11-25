import { describe, expect, it } from 'vitest';
import { computeFunnel } from './funnel';

describe('computeFunnel', () => {
  it('counts visitors only after the previous step', () => {
    const events = [
      { actor: 'a', name: 'page_view', ts: 1 },
      { actor: 'a', name: 'signup_started', ts: 5 },
      { actor: 'a', name: 'signup_completed', ts: 9 },
      { actor: 'b', name: 'signup_started', ts: 2 },
      { actor: 'b', name: 'page_view', ts: 4 },
      { actor: 'b', name: 'signup_started', ts: 6 },
      { actor: 'c', name: 'page_view', ts: 3 },
    ];
    const result = computeFunnel(events, ['page_view', 'signup_started', 'signup_completed']);
    expect(result.map((step) => step.users)).toEqual([3, 2, 1]);
    expect(result[1]?.conversionFromPrev).toBeCloseTo(2 / 3);
    expect(result[2]?.conversionFromStart).toBeCloseTo(1 / 3);
    expect(result[1]?.medianMillisFromPrev).toBe(3);
  });

  it('does not reuse one event for two steps', () => {
    const result = computeFunnel(
      [{ actor: 'a', name: 'page_view', ts: 1 }],
      ['page_view', 'page_view'],
    );
    expect(result.map((step) => step.users)).toEqual([1, 0]);
  });

  it('returns zeros for an empty stream', () => {
    const result = computeFunnel([], ['page_view', 'signup_started']);
    expect(result[0]?.users).toBe(0);
    expect(result[1]?.conversionFromPrev).toBe(0);
  });
});
