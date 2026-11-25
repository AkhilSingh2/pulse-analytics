import { getAcquisition, getProject, getSql, listEvents } from '@pulse/db';
import { filtersFromSearchParams, labelize, toCsv } from '@pulse/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? 'events';
  const query = filtersFromSearchParams((key) => url.searchParams.get(key));
  try {
    const project = await getProject(getSql());
    if (!project) return new Response('No project. Run npm run db:setup.\n', { status: 503 });
    let csv = '';
    let filename = 'pulse.csv';
    if (kind === 'pages' || kind === 'referrers') {
      const data = await getAcquisition(getSql(), project.id, query);
      if (kind === 'pages') {
        csv = toCsv(['path', 'views'], data.pages.map((row) => [row.path, row.views]));
        filename = 'pulse-pages.csv';
      } else {
        csv = toCsv(['referrer', 'views'], data.referrers.map((row) => [row.host, row.views]));
        filename = 'pulse-referrers.csv';
      }
    } else {
      const events = await listEvents(getSql(), project.id, query, {
        limit: 5000,
        search: url.searchParams.get('q'),
      });
      csv = toCsv(
        ['occurred_at', 'event', 'anonymous_id', 'user_id', 'path', 'country', 'device', 'channel'],
        events.map((event) => [
          event.occurredAt,
          event.name,
          event.anonymousId,
          event.userId,
          event.path,
          event.country,
          event.device,
          event.channel,
        ]),
      );
      filename = 'pulse-events.csv';
    }
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Pulse-Kind': kind === 'pages' || kind === 'referrers' ? kind : 'events',
        'X-Pulse-Label': labelize(kind),
      },
    });
  } catch (error) {
    console.error(error);
    return new Response('Export failed.\n', { status: 500 });
  }
}
