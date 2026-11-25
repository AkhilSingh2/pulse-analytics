export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export type RetentionInput = {
  actor: string;
  periods: number[];
};

export type RetentionCell = {
  index: number;
  users: number;
  rate: number;
  partial: boolean;
};

export type RetentionRow = {
  cohortStart: string;
  size: number;
  cells: Array<RetentionCell | null>;
};

export function startOfUtcDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Monday 00:00 UTC, matching PostgreSQL date_trunc('week') in a UTC session. */
export function startOfIsoWeekUTC(ms: number): number {
  const dayStart = startOfUtcDay(ms);
  const day = new Date(dayStart).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return dayStart - daysSinceMonday * DAY_MS;
}

export function buildRetention(
  rows: RetentionInput[],
  options: { periodMs: number; maxPeriods: number; asOf: number },
): RetentionRow[] {
  const cohorts = new Map<number, { size: number; counts: Map<number, number> }>();
  for (const row of rows) {
    if (row.periods.length === 0) continue;
    const cohort = Math.min(...row.periods);
    let entry = cohorts.get(cohort);
    if (!entry) {
      entry = { size: 0, counts: new Map() };
      cohorts.set(cohort, entry);
    }
    entry.size += 1;
    const seen = new Set<number>();
    for (const period of row.periods) {
      const index = Math.round((period - cohort) / options.periodMs);
      if (index < 0 || index >= options.maxPeriods || seen.has(index)) continue;
      seen.add(index);
      entry.counts.set(index, (entry.counts.get(index) ?? 0) + 1);
    }
  }

  return [...cohorts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, entry]) => ({
      cohortStart: new Date(start).toISOString(),
      size: entry.size,
      cells: Array.from({ length: options.maxPeriods }, (_, index) => {
        const periodStart = start + index * options.periodMs;
        if (periodStart > options.asOf) return null;
        const users = entry.counts.get(index) ?? 0;
        return {
          index,
          users,
          rate: entry.size === 0 ? 0 : users / entry.size,
          partial: periodStart + options.periodMs > options.asOf,
        };
      }),
    }));
}
