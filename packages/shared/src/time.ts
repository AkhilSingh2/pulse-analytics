import { PRESET_MS, RANGE_PRESETS, type RangePreset } from './constants';
import { DAY_MS } from './retention';

export type BucketUnit = 'hour' | 'day';

export type SeriesPoint = {
  bucket: string;
  events: number;
  users: number;
};

export function floorUtc(ms: number, unit: BucketUnit): number {
  const date = new Date(ms);
  if (unit === 'hour') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function fillBuckets(
  rows: SeriesPoint[],
  from: Date,
  to: Date,
  unit: BucketUnit,
): SeriesPoint[] {
  const step = unit === 'hour' ? 60 * 60 * 1000 : DAY_MS;
  const map = new Map(rows.map((row) => [new Date(row.bucket).toISOString(), row]));
  const out: SeriesPoint[] = [];
  for (let cursor = floorUtc(from.getTime(), unit); cursor < to.getTime(); cursor += step) {
    const key = new Date(cursor).toISOString();
    const hit = map.get(key);
    out.push({ bucket: key, events: hit?.events ?? 0, users: hit?.users ?? 0 });
  }
  return out;
}

export function bucketUnitForRange(from: Date, to: Date): BucketUnit {
  return to.getTime() - from.getTime() <= 48 * 60 * 60 * 1000 ? 'hour' : 'day';
}

export function retentionGrain(from: Date, to: Date): { unit: 'day' | 'week'; periodMs: number; maxPeriods: number } {
  if (to.getTime() - from.getTime() <= 14 * DAY_MS) {
    return { unit: 'day', periodMs: DAY_MS, maxPeriods: 14 };
  }
  return { unit: 'week', periodMs: 7 * DAY_MS, maxPeriods: 8 };
}

export function isRangePreset(value: string | null | undefined): value is RangePreset {
  return !!value && (RANGE_PRESETS as readonly string[]).includes(value);
}

export function resolveRange(
  input: { preset?: RangePreset | null; from?: string | null; to?: string | null },
  now = new Date(),
): { from: Date; to: Date; label: RangePreset | 'custom' } {
  if (input.from && input.to && input.preset !== '24h' && input.preset !== '7d' && input.preset !== '30d' && input.preset !== '90d') {
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new Error('invalid_range');
    }
    if (to.getTime() - from.getTime() > 180 * DAY_MS) throw new Error('range_too_large');
    return { from, to, label: 'custom' };
  }
  const preset = input.preset && isRangePreset(input.preset) ? input.preset : '30d';
  return {
    from: new Date(now.getTime() - PRESET_MS[preset]),
    to: now,
    label: preset,
  };
}
