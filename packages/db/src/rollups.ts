import type { Sql } from './client';

export async function rebuildRollups(sql: Sql, projectId: string) {
  await sql`delete from rollup_hourly where project_id = ${projectId}`;
  await sql`delete from rollup_page_daily where project_id = ${projectId}`;
  await sql`delete from rollup_referrer_daily where project_id = ${projectId}`;
  await sql`
    insert into rollup_hourly (project_id, bucket, event_name, device, channel, event_count)
    select project_id, date_trunc('hour', occurred_at), event_name, device, channel, count(*)::int
    from events
    where project_id = ${projectId}
    group by 1, 2, 3, 4, 5
  `;
  await sql`
    insert into rollup_page_daily (project_id, day, path, views)
    select project_id, (date_trunc('day', occurred_at))::date, coalesce(path, '(none)'), count(*)::int
    from events
    where project_id = ${projectId} and event_name = 'page_view'
    group by 1, 2, 3
  `;
  await sql`
    insert into rollup_referrer_daily (project_id, day, referrer_host, views)
    select project_id, (date_trunc('day', occurred_at))::date, referrer_host, count(*)::int
    from events
    where project_id = ${projectId} and event_name = 'page_view'
    group by 1, 2, 3
  `;
}

export async function rollupInserted(sql: Sql, ids: string[]) {
  if (ids.length === 0) return;
  await sql`
    insert into rollup_hourly (project_id, bucket, event_name, device, channel, event_count)
    select project_id, date_trunc('hour', occurred_at), event_name, device, channel, count(*)::int
    from events
    where id = any(${ids}::uuid[])
    group by 1, 2, 3, 4, 5
    on conflict (project_id, bucket, event_name, device, channel)
    do update set event_count = rollup_hourly.event_count + excluded.event_count
  `;
  await sql`
    insert into rollup_page_daily (project_id, day, path, views)
    select project_id, (date_trunc('day', occurred_at))::date, coalesce(path, '(none)'), count(*)::int
    from events
    where id = any(${ids}::uuid[]) and event_name = 'page_view'
    group by 1, 2, 3
    on conflict (project_id, day, path)
    do update set views = rollup_page_daily.views + excluded.views
  `;
  await sql`
    insert into rollup_referrer_daily (project_id, day, referrer_host, views)
    select project_id, (date_trunc('day', occurred_at))::date, referrer_host, count(*)::int
    from events
    where id = any(${ids}::uuid[]) and event_name = 'page_view'
    group by 1, 2, 3
    on conflict (project_id, day, referrer_host)
    do update set views = rollup_referrer_daily.views + excluded.views
  `;
}
