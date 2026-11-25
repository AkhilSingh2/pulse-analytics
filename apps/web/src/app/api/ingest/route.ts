import { findProjectByApiKey, getSql, ingestEvents } from '@pulse/db';
import {
  RATE_LIMIT,
  formatZodIssues,
  ingestBodySchema,
  normalizeEvent,
} from '@pulse/shared';
import { limiter } from '@/server/limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...cors, ...extra } });
}

function apiKey(request: Request) {
  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return request.headers.get('x-api-key')?.trim() ?? '';
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export function GET() {
  return json({
    ok: true,
    usage: 'POST { events: Event[] } with Authorization: Bearer <api key>',
    maxBatch: RATE_LIMIT.maxBatch,
    rateLimit: `${RATE_LIMIT.capacity} events burst, ${RATE_LIMIT.refillPerSecond}/sec refill`,
  });
}

export async function POST(request: Request) {
  const key = apiKey(request);
  if (!key) return json({ error: 'missing_api_key' }, 401);
  let project;
  try {
    project = await findProjectByApiKey(getSql(), key);
  } catch (error) {
    console.error(error);
    return json({ error: 'database_unavailable' }, 503);
  }
  if (!project) return json({ error: 'invalid_api_key' }, 401);

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 300_000) return json({ error: 'payload_too_large' }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = ingestBodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'invalid_payload', issues: formatZodIssues(parsed.error) }, 400);

  const decision = limiter().take(project.id, parsed.data.events.length);
  const headers = {
    'X-RateLimit-Limit': String(RATE_LIMIT.capacity),
    'X-RateLimit-Remaining': String(Math.max(0, decision.remaining)),
  };
  if (!decision.ok) {
    return json({ error: 'rate_limited' }, 429, {
      ...headers,
      'Retry-After': String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
    });
  }

  const now = Date.now();
  const userAgent = request.headers.get('user-agent');
  const events = parsed.data.events.map((event) => normalizeEvent(event, { now, userAgent }));
  try {
    const result = await ingestEvents(getSql(), project.id, events);
    return json(result, 200, headers);
  } catch (error) {
    console.error(error);
    return json({ error: 'ingest_failed' }, 500, headers);
  }
}
