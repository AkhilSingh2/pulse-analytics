import {
  buildRetention,
  computeFunnel,
  describeRange,
  fillBuckets,
  floorUtc,
  retentionGrain,
  startOfIsoWeekUTC,
  startOfUtcDay,
  bucketUnitForRange,
  type FunnelStepResult,
  type RangeQuery,
  type RetentionRow,
  type Segment,
  type SeriesPoint,
} from '@pulse/shared';
import type { Sql } from './client';

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  return 0;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function segmentClause(sql: Sql, segment: Segment) {
  return sql`
    (${segment.device ?? null}::text is null or device = ${segment.device ?? null})
    and (${segment.country ?? null}::text is null or country = ${segment.country ?? null})
    and (${segment.channel ?? null}::text is null or channel = ${segment.channel ?? null})
  `;
}

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  apiKey: string;
};

export async function getProject(sql: Sql): Promise<ProjectRow | null> {
  const rows = await sql<{ id: string; name: string; slug: string; api_key: string }[]>`
    select id, name, slug, api_key from projects order by created_at asc limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, slug: row.slug, apiKey: row.api_key };
}

export async function findProjectByApiKey(sql: Sql, apiKey: string): Promise<ProjectRow | null> {
  const rows = await sql<{ id: string; name: string; slug: string; api_key: string }[]>`
    select id, name, slug, api_key from projects where api_key = ${apiKey} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, slug: row.slug, apiKey: row.api_key };
}

async function counts(sql: Sql, projectId: string, from: Date, to: Date, segment: Segment) {
  const rows = await sql<{ events: number; visitors: number; sessions: number }[]>`
    select count(*)::int as events,
           count(distinct anonymous_id)::int as visitors,
           count(distinct session_id)::int as sessions
    from events
    where project_id = ${projectId}
      and occurred_at >= ${from}::timestamptz
      and occurred_at < ${to}::timestamptz
      and ${segmentClause(sql, segment)}
  `;
  return {
    events: num(rows[0]?.events),
    visitors: num(rows[0]?.visitors),
    sessions: num(rows[0]?.sessions),
  };
}

async function activation(sql: Sql, projectId: string, from: Date, to: Date, segment: Segment) {
  const rows = await sql<{ signups: number; activations: number }[]>`
    with actors as (
      select anonymous_id,
             min(occurred_at) filter (where event_name = 'signup_completed') as signed_up,
             min(occurred_at) filter (where event_name = 'feature_used') as activated
      from events
      where project_id = ${projectId}
        and occurred_at >= ${from}::timestamptz
        and occurred_at < ${to}::timestamptz
        and event_name in ('signup_completed', 'feature_used')
        and ${segmentClause(sql, segment)}
      group by 1
    )
    select
      count(*) filter (where signed_up is not null)::int as signups,
      count(*) filter (
        where signed_up is not null and activated is not null and activated >= signed_up
      )::int as activations
    from actors
  `;
  const signups = num(rows[0]?.signups);
  const activations = num(rows[0]?.activations);
  return signups === 0 ? 0 : activations / signups;
}

export type Overview = {
  range: { from: string; to: string; label: string };
  volumeSource: 'rollup' | 'raw';
  bucket: 'hour' | 'day';
  priorComplete: boolean;
  kpis: {
    events: { value: number; previous: number };
    visitors: { value: number; previous: number };
    sessions: { value: number; previous: number };
    activation: { value: number; previous: number };
  };
  series: SeriesPoint[];
  topEvents: Array<{ name: string; count: number }>;
};

export async function getOverview(sql: Sql, projectId: string, query: RangeQuery, now = new Date()): Promise<Overview> {
  const range = describeRange(query, now);
  const span = range.to.getTime() - range.from.getTime();
  const previous = { from: new Date(range.from.getTime() - span), to: range.from };
  const segment: Segment = { device: query.device, country: query.country, channel: query.channel };
  const [current, prior, currentActivation, priorActivation, series, topEvents, bounds] = await Promise.all([
    counts(sql, projectId, range.from, range.to, segment),
    counts(sql, projectId, previous.from, previous.to, segment),
    activation(sql, projectId, range.from, range.to, segment),
    activation(sql, projectId, previous.from, previous.to, segment),
    seriesFor(sql, projectId, range.from, range.to, segment),
    topEventsFor(sql, projectId, range.from, range.to, segment),
    sql<{ first: Date | null }[]>`select min(occurred_at) as first from events where project_id = ${projectId}`,
  ]);
  const firstEvent = bounds[0]?.first ? new Date(bounds[0].first).getTime() : null;
  return {
    priorComplete: firstEvent != null && firstEvent <= previous.from.getTime(),
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    volumeSource: series.source,
    bucket: series.bucket,
    kpis: {
      events: { value: current.events, previous: prior.events },
      visitors: { value: current.visitors, previous: prior.visitors },
      sessions: { value: current.sessions, previous: prior.sessions },
      activation: { value: currentActivation, previous: priorActivation },
    },
    series: series.points,
    topEvents,
  };
}

async function seriesFor(sql: Sql, projectId: string, from: Date, to: Date, segment: Segment) {
  const bucket = bucketUnitForRange(from, to);
  const raw = await sql<{ bucket: Date; events: number; users: number }[]>`
    select date_trunc(${bucket}::text, occurred_at) as bucket,
           count(*)::int as events,
           count(distinct anonymous_id)::int as users
    from events
    where project_id = ${projectId}
      and occurred_at >= ${from}::timestamptz
      and occurred_at < ${to}::timestamptz
      and ${segmentClause(sql, segment)}
    group by 1
    order by 1
  `;
  const points = raw.map((row) => ({
    bucket: iso(row.bucket),
    events: num(row.events),
    users: num(row.users),
  }));
  if (segment.country) {
    return { source: 'raw' as const, bucket, points: fillBuckets(points, from, to, bucket) };
  }
  const rolled = await sql<{ bucket: Date; events: number }[]>`
    select bucket, sum(event_count)::int as events
    from rollup_hourly
    where project_id = ${projectId}
      and bucket >= date_trunc('hour', ${from}::timestamptz)
      and bucket <= date_trunc('hour', ${to}::timestamptz)
      and (${segment.device ?? null}::text is null or device = ${segment.device ?? null})
      and (${segment.channel ?? null}::text is null or channel = ${segment.channel ?? null})
    group by bucket
  `;
  const totals = new Map<string, number>();
  for (const row of rolled) {
    const key = new Date(floorUtc(new Date(row.bucket).getTime(), bucket)).toISOString();
    totals.set(key, (totals.get(key) ?? 0) + num(row.events));
  }
  const merged = points.map((point) => {
    const key = new Date(floorUtc(Date.parse(point.bucket), bucket)).toISOString();
    return { ...point, bucket: key, events: totals.get(key) ?? point.events };
  });
  return { source: 'rollup' as const, bucket, points: fillBuckets(merged, from, to, bucket) };
}

async function topEventsFor(sql: Sql, projectId: string, from: Date, to: Date, segment: Segment) {
  if (segment.country) {
    const rows = await sql<{ event_name: string; count: number }[]>`
      select event_name, count(*)::int as count
      from events
      where project_id = ${projectId}
        and occurred_at >= ${from}::timestamptz
        and occurred_at < ${to}::timestamptz
        and ${segmentClause(sql, segment)}
      group by 1
      order by count desc
      limit 6
    `;
    return rows.map((row) => ({ name: row.event_name, count: num(row.count) }));
  }
  const rows = await sql<{ event_name: string; count: number }[]>`
    select event_name, sum(event_count)::int as count
    from rollup_hourly
    where project_id = ${projectId}
      and bucket >= date_trunc('hour', ${from}::timestamptz)
      and bucket <= date_trunc('hour', ${to}::timestamptz)
      and (${segment.device ?? null}::text is null or device = ${segment.device ?? null})
      and (${segment.channel ?? null}::text is null or channel = ${segment.channel ?? null})
    group by 1
    order by count desc
    limit 6
  `;
  return rows.map((row) => ({ name: row.event_name, count: num(row.count) }));
}

export async function getFunnel(
  sql: Sql,
  projectId: string,
  query: RangeQuery,
  steps: string[],
  now = new Date(),
): Promise<{ range: { from: string; to: string; label: string }; steps: FunnelStepResult[] }> {
  const range = describeRange(query, now);
  const segment: Segment = { device: query.device, country: query.country, channel: query.channel };
  const rows = await sql<{ actor: string; name: string; occurred_at: Date }[]>`
    select anonymous_id as actor, event_name as name, occurred_at
    from events
    where project_id = ${projectId}
      and occurred_at >= ${range.from}::timestamptz
      and occurred_at < ${range.to}::timestamptz
      and event_name = any(${steps}::text[])
      and ${segmentClause(sql, segment)}
    order by anonymous_id, occurred_at
  `;
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    steps: computeFunnel(
      rows.map((row) => ({ actor: row.actor, name: row.name, ts: new Date(row.occurred_at).getTime() })),
      steps,
    ),
  };
}

export async function getRetention(
  sql: Sql,
  projectId: string,
  query: RangeQuery,
  now = new Date(),
): Promise<{
  range: { from: string; to: string; label: string };
  grain: 'day' | 'week';
  rows: RetentionRow[];
}> {
  const range = describeRange(query, now);
  const grain = retentionGrain(range.from, range.to);
  const segment: Segment = { device: query.device, country: query.country, channel: query.channel };
  const rows =
    grain.unit === 'week'
      ? await sql<{ actor: string; periods: Date[] }[]>`
          select anonymous_id as actor,
                 array_agg(distinct date_trunc('week', occurred_at)) as periods
          from events
          where project_id = ${projectId}
            and ${segmentClause(sql, segment)}
          group by 1
        `
      : await sql<{ actor: string; periods: Date[] }[]>`
          select anonymous_id as actor,
                 array_agg(distinct date_trunc('day', occurred_at)) as periods
          from events
          where project_id = ${projectId}
            and ${segmentClause(sql, segment)}
          group by 1
        `;
  const built = buildRetention(
    rows.map((row) => ({
      actor: row.actor,
      periods: (row.periods ?? []).map((period) => new Date(period).getTime()),
    })),
    { periodMs: grain.periodMs, maxPeriods: grain.maxPeriods, asOf: now.getTime() },
  );
  const windowStart = grain.unit === 'week' ? startOfIsoWeekUTC(range.from.getTime()) : startOfUtcDay(range.from.getTime());
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    grain: grain.unit,
    rows: built.filter((row) => {
      const start = Date.parse(row.cohortStart);
      return start >= windowStart && start < range.to.getTime();
    }),
  };
}

export type Acquisition = {
  source: 'rollup' | 'raw';
  pages: Array<{ path: string; views: number }>;
  referrers: Array<{ host: string; views: number }>;
  devices: Array<{ device: string; events: number }>;
  channels: Array<{ channel: string; events: number }>;
};

export async function getAcquisition(sql: Sql, projectId: string, query: RangeQuery, now = new Date()): Promise<Acquisition> {
  const range = describeRange(query, now);
  const segment: Segment = { device: query.device, country: query.country, channel: query.channel };
  const filtered = Boolean(segment.device || segment.country || segment.channel);
  if (filtered) {
    const [pages, referrers, devices, channels] = await Promise.all([
      sql<{ path: string; views: number }[]>`
        select coalesce(path, '(none)') as path, count(*)::int as views
        from events
        where project_id = ${projectId}
          and event_name = 'page_view'
          and occurred_at >= ${range.from}::timestamptz
          and occurred_at < ${range.to}::timestamptz
          and ${segmentClause(sql, segment)}
        group by 1
        order by views desc
        limit 8
      `,
      sql<{ host: string; views: number }[]>`
        select referrer_host as host, count(*)::int as views
        from events
        where project_id = ${projectId}
          and event_name = 'page_view'
          and occurred_at >= ${range.from}::timestamptz
          and occurred_at < ${range.to}::timestamptz
          and ${segmentClause(sql, segment)}
        group by 1
        order by views desc
        limit 8
      `,
      sql<{ device: string; events: number }[]>`
        select device, count(*)::int as events
        from events
        where project_id = ${projectId}
          and occurred_at >= ${range.from}::timestamptz
          and occurred_at < ${range.to}::timestamptz
          and ${segmentClause(sql, segment)}
        group by 1
        order by events desc
      `,
      sql<{ channel: string; events: number }[]>`
        select channel, count(*)::int as events
        from events
        where project_id = ${projectId}
          and occurred_at >= ${range.from}::timestamptz
          and occurred_at < ${range.to}::timestamptz
          and ${segmentClause(sql, segment)}
        group by 1
        order by events desc
      `,
    ]);
    return {
      source: 'raw',
      pages: pages.map((row) => ({ path: row.path, views: num(row.views) })),
      referrers: referrers.map((row) => ({ host: row.host, views: num(row.views) })),
      devices: devices.map((row) => ({ device: row.device, events: num(row.events) })),
      channels: channels.map((row) => ({ channel: row.channel, events: num(row.events) })),
    };
  }
  const [pages, referrers, devices, channels] = await Promise.all([
    sql<{ path: string; views: number }[]>`
      select path, sum(views)::int as views
      from rollup_page_daily
      where project_id = ${projectId}
        and day >= ${range.from}::date
        and day <= ${range.to}::date
      group by path
      order by views desc
      limit 8
    `,
    sql<{ host: string; views: number }[]>`
      select referrer_host as host, sum(views)::int as views
      from rollup_referrer_daily
      where project_id = ${projectId}
        and day >= ${range.from}::date
        and day <= ${range.to}::date
      group by referrer_host
      order by views desc
      limit 8
    `,
    sql<{ device: string; events: number }[]>`
      select device, sum(event_count)::int as events
      from rollup_hourly
      where project_id = ${projectId}
        and bucket >= date_trunc('hour', ${range.from}::timestamptz)
        and bucket <= date_trunc('hour', ${range.to}::timestamptz)
      group by device
      order by events desc
    `,
    sql<{ channel: string; events: number }[]>`
      select channel, sum(event_count)::int as events
      from rollup_hourly
      where project_id = ${projectId}
        and bucket >= date_trunc('hour', ${range.from}::timestamptz)
        and bucket <= date_trunc('hour', ${range.to}::timestamptz)
      group by channel
      order by events desc
    `,
  ]);
  return {
    source: 'rollup',
    pages: pages.map((row) => ({ path: row.path, views: num(row.views) })),
    referrers: referrers.map((row) => ({ host: row.host, views: num(row.views) })),
    devices: devices.map((row) => ({ device: row.device, events: num(row.events) })),
    channels: channels.map((row) => ({ channel: row.channel, events: num(row.events) })),
  };
}

export type EventRow = {
  id: string;
  name: string;
  anonymousId: string;
  userId: string | null;
  occurredAt: string;
  path: string | null;
  channel: string;
  country: string;
  device: string;
  properties: Record<string, unknown>;
};

function mapEvent(row: {
  id: string;
  event_name: string;
  anonymous_id: string;
  user_id: string | null;
  occurred_at: Date;
  path: string | null;
  channel: string;
  country: string;
  device: string;
  properties: Record<string, unknown>;
}): EventRow {
  return {
    id: row.id,
    name: row.event_name,
    anonymousId: row.anonymous_id,
    userId: row.user_id,
    occurredAt: iso(row.occurred_at),
    path: row.path,
    channel: row.channel,
    country: row.country,
    device: row.device,
    properties: row.properties ?? {},
  };
}

export async function listEvents(
  sql: Sql,
  projectId: string,
  query: RangeQuery,
  options: { limit: number; search?: string | null; now?: Date },
): Promise<EventRow[]> {
  const range = describeRange(query, options.now ?? new Date());
  const segment: Segment = { device: query.device, country: query.country, channel: query.channel };
  const search = options.search?.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, 40) || null;
  const rows = await sql<Parameters<typeof mapEvent>[0][]>`
    select id, event_name, anonymous_id, user_id, occurred_at, path, channel, country, device, properties
    from events
    where project_id = ${projectId}
      and occurred_at >= ${range.from}::timestamptz
      and occurred_at < ${range.to}::timestamptz
      and ${segmentClause(sql, segment)}
      and (${search}::text is null or strpos(lower(event_name), ${search}) > 0)
    order by occurred_at desc
    limit ${options.limit}
  `;
  return rows.map(mapEvent);
}

export async function recentEvents(sql: Sql, projectId: string, segment: Segment, limit = 40): Promise<EventRow[]> {
  const rows = await sql<Parameters<typeof mapEvent>[0][]>`
    select id, event_name, anonymous_id, user_id, occurred_at, path, channel, country, device, properties
    from events
    where project_id = ${projectId}
      and occurred_at >= now() - interval '7 days'
      and ${segmentClause(sql, segment)}
    order by occurred_at desc
    limit ${limit}
  `;
  return rows.map(mapEvent);
}

export type SavedView = {
  id: string;
  name: string;
  path: string;
  query: string;
  createdAt: string;
};

export async function listViews(sql: Sql, projectId: string): Promise<SavedView[]> {
  const rows = await sql<{ id: string; name: string; path: string; query: string; created_at: Date }[]>`
    select id, name, path, query, created_at
    from saved_views
    where project_id = ${projectId}
    order by created_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    query: row.query,
    createdAt: iso(row.created_at),
  }));
}

export async function createView(
  sql: Sql,
  projectId: string,
  input: { name: string; path: string; query: string },
): Promise<SavedView> {
  const rows = await sql<{ id: string; name: string; path: string; query: string; created_at: Date }[]>`
    insert into saved_views (project_id, name, path, query)
    values (${projectId}, ${input.name}, ${input.path}, ${input.query})
    returning id, name, path, query, created_at
  `;
  const row = rows[0]!;
  return { id: row.id, name: row.name, path: row.path, query: row.query, createdAt: iso(row.created_at) };
}

export async function deleteView(sql: Sql, projectId: string, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    delete from saved_views where project_id = ${projectId} and id = ${id} returning id
  `;
  return rows.length > 0;
}

export async function pipelineStats(sql: Sql, projectId: string) {
  const rows = await sql<
    {
      events: number;
      hourly: number;
      pages: number;
      referrers: number;
      views: number;
      last_event: Date | null;
    }[]
  >`
    select
      (select count(*)::int from events where project_id = ${projectId}) as events,
      (select count(*)::int from rollup_hourly where project_id = ${projectId}) as hourly,
      (select count(*)::int from rollup_page_daily where project_id = ${projectId}) as pages,
      (select count(*)::int from rollup_referrer_daily where project_id = ${projectId}) as referrers,
      (select count(*)::int from saved_views where project_id = ${projectId}) as views,
      (select max(occurred_at) from events where project_id = ${projectId}) as last_event
  `;
  const row = rows[0];
  return {
    events: num(row?.events),
    hourlyRollups: num(row?.hourly),
    pageRollups: num(row?.pages),
    referrerRollups: num(row?.referrers),
    savedViews: num(row?.views),
    lastEventAt: row?.last_event ? iso(row.last_event) : null,
  };
}
