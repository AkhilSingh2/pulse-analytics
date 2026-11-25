import { describe, expect, it } from 'vitest';
import { formatBucket, isActive } from './nav';

describe('navigation', () => {
  it('marks only the current section active', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/funnels', '/')).toBe(false);
    expect(isActive('/funnels', '/funnels')).toBe(true);
    expect(isActive('/events', '/events')).toBe(true);
  });

  it('formats utc buckets without shifting the day', () => {
    expect(formatBucket('2026-11-25T00:30:00.000Z', 'day')).toBe('Nov 25');
    expect(formatBucket('2026-11-25T15:00:00.000Z', 'hour')).toContain('15');
  });
});
