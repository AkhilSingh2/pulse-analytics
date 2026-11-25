import { z } from 'zod';
import { DEVICES, RATE_LIMIT, type Channel, type Device } from './constants';
import { channelFromReferrer, deviceFromUserAgent, referrerHost } from './referrer';

const propertyValue = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

export const eventInputSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/, 'invalid event name'),
  clientEventId: z.uuid().optional(),
  timestamp: z.iso.datetime().optional(),
  anonymousId: z.string().min(8).max(64),
  userId: z.string().min(1).max(64).nullable().optional(),
  sessionId: z.string().min(8).max(64),
  path: z.string().max(512).nullable().optional(),
  referrer: z.string().max(1024).nullable().optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  device: z.enum(DEVICES).optional(),
  properties: z
    .record(z.string().max(64), propertyValue)
    .optional()
    .refine((value) => !value || Object.keys(value).length <= 25, {
      message: 'properties can include at most 25 keys',
    }),
});

export const ingestBodySchema = z.object({
  sentAt: z.iso.datetime().optional(),
  events: z.array(eventInputSchema).min(1).max(RATE_LIMIT.maxBatch),
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type IngestBody = z.infer<typeof ingestBodySchema>;
export type PropertyValue = string | number | boolean | null;

export type NormalizedEvent = {
  clientEventId: string;
  name: string;
  anonymousId: string;
  userId: string | null;
  sessionId: string;
  occurredAt: Date;
  path: string | null;
  referrer: string | null;
  referrerHost: string;
  channel: Channel;
  country: string;
  device: Device;
  properties: Record<string, PropertyValue>;
};

const FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function clampTimestamp(input: string | undefined, now = Date.now()): Date {
  const parsed = input ? Date.parse(input) : now;
  const value = Number.isNaN(parsed) ? now : parsed;
  return new Date(Math.min(now + FUTURE_SKEW_MS, Math.max(now - MAX_AGE_MS, value)));
}

export function normalizeEvent(
  input: EventInput,
  options: { now?: number; userAgent?: string | null; clientEventId?: string } = {},
): NormalizedEvent {
  const now = options.now ?? Date.now();
  const referrer = input.referrer?.trim() || null;
  const path = input.path?.trim() || null;
  return {
    clientEventId: input.clientEventId ?? options.clientEventId ?? crypto.randomUUID(),
    name: input.name,
    anonymousId: input.anonymousId,
    userId: input.userId ?? null,
    sessionId: input.sessionId,
    occurredAt: clampTimestamp(input.timestamp, now),
    path: path ? path.slice(0, 512) : null,
    referrer,
    referrerHost: referrerHost(referrer),
    channel: channelFromReferrer(referrer),
    country: input.country ?? 'ZZ',
    device: input.device ?? deviceFromUserAgent(options.userAgent),
    properties: input.properties ?? {},
  };
}

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'body';
    return `${path}: ${issue.message}`;
  });
}
