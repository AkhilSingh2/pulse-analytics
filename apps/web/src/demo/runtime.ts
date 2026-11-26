'use client';

import { ingestEvents } from '@pulse/db/ingest';
import {
  createView,
  deleteView,
  getAcquisition,
  getFunnel,
  getOverview,
  getProject,
  getRetention,
  listEvents,
  listViews,
  pipelineStats,
  recentEvents,
} from '@pulse/db/queries';
import { createPulse, memoryStorage } from '@pulse/sdk';
import {
  RATE_LIMIT,
  filtersFromSearchParams,
  formatZodIssues,
  ingestBodySchema,
  normalizeEvent,
  funnelQuerySchema,
  presetSteps,
  rangeQuerySchema,
  segmentSchema,
  toCsv,
  type Channel,
  type Device,
} from '@pulse/shared';
import { STATIC_DEMO } from './flag';
import { bootWarehouse, type Warehouse } from './warehouse';

/**
 * Static demo (GitHub Pages): there is no server, so the warehouse is an in-browser
 * Postgres (PGlite) seeded with synthetic Northstar traffic, and the dashboard's tRPC
 * calls run the real query functions against it. Enabled by NEXT_PUBLIC_STATIC_DEMO.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

let warehouse: Promise<Warehouse> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWarehouse() {
  if (!warehouse) {
    warehouse = fetch(`${BASE}/demo-schema.sql`)
      .then((response) => response.text())
      .then((schema) => bootWarehouse(schema))
      .then((ready) => {
        startTraffic();
        return ready;
      });
  }
  return warehouse;
}

/** PGlite runs one statement at a time; keep demo requests in order. */
function serial<T>(work: (w: Warehouse) => Promise<T>): Promise<T> {
  const run = queue.then(() => getWarehouse().then(work));
  queue = run.catch(() => undefined);
  return run;
}

export function callProcedure(path: string, raw: unknown): Promise<unknown> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const range = () => rangeQuerySchema.parse(input);
  return serial(async ({ sql, projectId }) => {
    switch (path) {
      case 'overview':
        return getOverview(sql, projectId, range());
      case 'funnel': {
        const funnel = funnelQuerySchema.parse(input);
        return getFunnel(sql, projectId, funnel, funnel.steps?.length ? funnel.steps : presetSteps('acquisition'));
      }
      case 'retention':
        return getRetention(sql, projectId, range());
      case 'acquisition':
        return getAcquisition(sql, projectId, range());
      case 'events': {
        const search = typeof input.search === 'string' ? input.search.slice(0, 40) : undefined;
        return { events: await listEvents(sql, projectId, range(), { limit: 80, search }) };
      }
      case 'stream':
        return { events: await recentEvents(sql, projectId, segmentSchema.parse(input), 36), serverTime: new Date().toISOString() };
      case 'views.list':
        return listViews(sql, projectId);
      case 'views.create':
        return createView(sql, projectId, input as Parameters<typeof createView>[2]);
      case 'views.delete':
        return { removed: await deleteView(sql, projectId, String(input.id)) };
      case 'settings': {
        const project = await getProject(sql);
        return { project, stats: await pipelineStats(sql, projectId), rateLimit: RATE_LIMIT, ingestPath: '/api/ingest' };
      }
      default:
        throw new Error(`Unknown procedure ${path}`);
    }
  });
}

async function ingest(body: string | null): Promise<Response> {
  let payload: unknown;
  try {
    payload = JSON.parse(body ?? '');
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = ingestBodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: 'invalid_payload', issues: formatZodIssues(parsed.error) }, { status: 400 });
  const now = Date.now();
  const events = parsed.data.events.map((event) => normalizeEvent(event, { now, userAgent: navigator.userAgent }));
  const result = await serial(({ sql, projectId }) => ingestEvents(sql, projectId, events));
  return Response.json(result);
}

async function exportCsv(href: string) {
  const url = new URL(href, window.location.href);
  const kind = url.searchParams.get('kind') ?? 'events';
  const query = filtersFromSearchParams((key) => url.searchParams.get(key));
  const { csv, filename } = await serial(async ({ sql, projectId }) => {
    if (kind === 'pages' || kind === 'referrers') {
      const data = await getAcquisition(sql, projectId, query);
      return kind === 'pages'
        ? { csv: toCsv(['path', 'views'], data.pages.map((row) => [row.path, row.views])), filename: 'pulse-pages.csv' }
        : { csv: toCsv(['referrer', 'views'], data.referrers.map((row) => [row.host, row.views])), filename: 'pulse-referrers.csv' };
    }
    const events = await listEvents(sql, projectId, query, { limit: 5000, search: url.searchParams.get('q') });
    return {
      filename: 'pulse-events.csv',
      csv: toCsv(
        ['occurred_at', 'event', 'anonymous_id', 'user_id', 'path', 'country', 'device', 'channel'],
        events.map((event) => [event.occurredAt, event.name, event.anonymousId, event.userId, event.path, event.country, event.device, event.channel]),
      ),
    };
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** A light version of `npm run simulate`, posting through the real SDK so the live stream moves. */
function startTraffic() {
  const pulse = createPulse({
    apiKey: 'pulse_live_demo_northstar',
    endpoint: `${window.location.origin}${BASE}/api/ingest`,
    flushIntervalMs: 1500,
    maxBatchSize: 8,
    storage: memoryStorage(),
    sessionStorage: memoryStorage(),
  });
  const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]!;
  const channels: Channel[] = ['direct', 'google', 'github', 'twitter', 'newsletter', 'other'];
  const devices: Device[] = ['desktop', 'desktop', 'mobile', 'tablet'];
  const actors = Array.from({ length: 10 }, (_, index) => ({
    anonymousId: `anon_live_${index}_${Math.random().toString(36).slice(2, 8)}`,
    userId: index % 3 === 0 ? `user_live_${index}` : null,
    sessionId: `ses_live_${index}_${Math.random().toString(36).slice(2, 8)}`,
    country: pick(['US', 'IN', 'GB', 'DE', 'CA', 'SG', 'BR']),
    device: pick(devices),
    channel: pick(channels),
  }));
  window.setInterval(() => {
    if (document.hidden) return;
    const actor = pick(actors);
    const context = { anonymousId: actor.anonymousId, userId: actor.userId, sessionId: actor.sessionId };
    const base = { country: actor.country, device: actor.device };
    const roll = Math.random();
    if (roll < 0.65) pulse.track('page_view', { ...base, path: pick(['/', '/pricing', '/docs', '/blog', '/app', '/app/boards']), title: 'Live' }, context);
    else if (roll < 0.8) pulse.track('signup_started', { ...base, path: '/signup' }, context);
    else if (roll < 0.92) pulse.track('feature_used', { ...base, path: '/app/boards', feature: pick(['boards', 'insights', 'alerts', 'digest']) }, context);
    else pulse.track('upgrade_clicked', { ...base, path: '/pricing', plan: 'pro' }, context);
  }, 2200);
}

export function installDemoRuntime() {
  if (!STATIC_DEMO || typeof window === 'undefined') return;
  const flagged = window as typeof window & { __pulseDemo?: boolean };
  if (flagged.__pulseDemo) return;
  flagged.__pulseDemo = true;
  void getWarehouse();
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin && url.pathname.endsWith('/api/ingest') && (init?.method ?? 'GET').toUpperCase() === 'POST') {
      return ingest(typeof init?.body === 'string' ? init.body : null);
    }
    return original(input, init);
  };
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest?.('a[href*="/api/export"]') as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    void exportCsv(link.href);
  });
}
