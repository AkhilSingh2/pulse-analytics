import type { NormalizedEvent } from '@pulse/shared';
import type { Sql } from './client';

export type StoredEvent = NormalizedEvent & {
  projectId: string;
  receivedAt?: Date;
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export async function insertEvents(sql: Sql, events: StoredEvent[]): Promise<string[]> {
  const ids: string[] = [];
  for (const chunk of chunks(events, 500)) {
    const received = chunk.map((event) => event.receivedAt ?? new Date());
    const inserted = await sql<{ id: string }[]>`
      insert into events (
        project_id, client_event_id, event_name, anonymous_id, user_id, session_id,
        occurred_at, received_at, path, referrer, referrer_host, channel, country, device, properties
      )
      select
        project_id,
        client_event_id,
        event_name,
        anonymous_id,
        user_id,
        session_id,
        occurred_at,
        received_at,
        path,
        referrer,
        referrer_host,
        channel,
        country,
        device,
        properties::jsonb
      from unnest(
        ${chunk.map((event) => event.projectId)}::uuid[],
        ${chunk.map((event) => event.clientEventId)}::text[],
        ${chunk.map((event) => event.name)}::text[],
        ${chunk.map((event) => event.anonymousId)}::text[],
        ${chunk.map((event) => event.userId)}::text[],
        ${chunk.map((event) => event.sessionId)}::text[],
        ${chunk.map((event) => event.occurredAt)}::timestamptz[],
        ${received}::timestamptz[],
        ${chunk.map((event) => event.path)}::text[],
        ${chunk.map((event) => event.referrer)}::text[],
        ${chunk.map((event) => event.referrerHost)}::text[],
        ${chunk.map((event) => event.channel)}::text[],
        ${chunk.map((event) => event.country)}::text[],
        ${chunk.map((event) => event.device)}::text[],
        ${chunk.map((event) => JSON.stringify(event.properties))}::text[]
      ) as t(
        project_id, client_event_id, event_name, anonymous_id, user_id, session_id,
        occurred_at, received_at, path, referrer, referrer_host, channel, country, device, properties
      )
      on conflict (project_id, client_event_id) do nothing
      returning id
    `;
    for (const row of inserted) ids.push(row.id);
  }
  return ids;
}
