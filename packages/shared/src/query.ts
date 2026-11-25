import { z } from 'zod';
import { CHANNELS, DEVICES, FUNNEL_PRESETS, RANGE_PRESETS, type RangePreset } from './constants';
import { isRangePreset, resolveRange } from './time';

export const segmentSchema = z.object({
  device: z.enum(DEVICES).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  channel: z.enum(CHANNELS).optional(),
});

export const rangeQuerySchema = z
  .object({
    preset: z.enum(RANGE_PRESETS).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .extend(segmentSchema.shape);

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type Segment = z.infer<typeof segmentSchema>;

export const funnelQuerySchema = rangeQuerySchema.extend({
  steps: z
    .array(z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/))
    .min(2)
    .max(6)
    .optional(),
});

export function filtersFromSearchParams(get: (key: string) => string | null): RangeQuery {
  const range = get('range');
  const preset = isRangePreset(range) ? range : undefined;
  const from = get('from') || undefined;
  const to = get('to') || undefined;
  const device = get('device');
  const country = get('country');
  const channel = get('channel');
  const parsed = rangeQuerySchema.safeParse({
    preset: range === 'custom' ? undefined : preset,
    from: range === 'custom' ? from : undefined,
    to: range === 'custom' ? to : undefined,
    device: device || undefined,
    country: country || undefined,
    channel: channel || undefined,
  });
  if (!parsed.success) return { preset: '30d' };
  return parsed.data;
}

export function describeRange(query: RangeQuery, now = new Date()): { from: Date; to: Date; label: RangePreset | 'custom' } {
  return resolveRange(
    {
      preset: query.from && query.to ? null : (query.preset ?? '30d'),
      from: query.from,
      to: query.to,
    },
    now,
  );
}

export function presetSteps(id: string | null | undefined): string[] {
  const preset = FUNNEL_PRESETS.find((item) => item.id === id);
  return preset ? [...preset.steps] : [...FUNNEL_PRESETS[0].steps];
}
