import { describe, expect, it } from 'vitest';
import { WEEK_MS, buildRetention, startOfIsoWeekUTC } from './retention';

describe('buildRetention', () => {
  it('keeps week 0 at 100% and leaves future weeks empty', () => {
    const week0 = Date.UTC(2026, 9, 5);
    const week1 = week0 + WEEK_MS;
    expect(startOfIsoWeekUTC(week0 + 3 * 24 * 60 * 60 * 1000)).toBe(week0);
    const rows = buildRetention(
      [
        { actor: 'a', periods: [week0, week1] },
        { actor: 'b', periods: [week0] },
        { actor: 'c', periods: [week1] },
      ],
      { periodMs: WEEK_MS, maxPeriods: 4, asOf: week1 + 2 * 24 * 60 * 60 * 1000 },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.size).toBe(2);
    expect(rows[0]?.cells[0]?.rate).toBe(1);
    expect(rows[0]?.cells[1]?.users).toBe(1);
    expect(rows[0]?.cells[1]?.partial).toBe(true);
    expect(rows[0]?.cells[2]).toBeNull();
    expect(rows[1]?.size).toBe(1);
    expect(rows[1]?.cells[0]?.partial).toBe(true);
  });
});
