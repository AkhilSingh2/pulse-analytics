'use client';

import { COUNTRY_NAMES, filtersFromSearchParams, formatNumber, formatPercent, labelize } from '@pulse/shared';
import { keepPreviousData } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ago, Delta, ErrorState, ExportButton, Kpi, LoadingBlock, PageHeader, Ranked } from './ui';
import { trpc } from '@/lib/trpc';

const VolumeChart = dynamic(() => import('./charts').then((mod) => mod.VolumeChart), {
  ssr: false,
  loading: () => <div className="skeleton h-80" />,
});

export function OverviewView() {
  const params = useSearchParams();
  const query = useMemo(() => filtersFromSearchParams((key) => params.get(key)), [params]);
  const overview = trpc.overview.useQuery(query, { placeholderData: keepPreviousData, refetchInterval: 15_000 });
  const stream = trpc.stream.useQuery(
    { device: query.device, country: query.country, channel: query.channel },
    { refetchInterval: 2000 },
  );
  if (overview.isLoading && !overview.data) return <LoadingBlock />;
  if (overview.error) return <ErrorState message={overview.error.message} />;
  if (!overview.data) return null;
  const data = overview.data;
  const rangeLabel = data.range.label === 'custom' ? 'custom range' : `last ${data.range.label}`;
  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={`Northstar · ${rangeLabel}`}
        title="Overview"
        description="Volume, activation, and whatever just arrived."
        actions={<ExportButton kind="events" />}
      />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi testId="kpi-events" label="Events" value={formatNumber(data.kpis.events.value)} hint="All tracked events" delta={<HistoryDelta complete={data.priorComplete} current={data.kpis.events.value} previous={data.kpis.events.previous} />} />
        <Kpi testId="kpi-visitors" label="Visitors" value={formatNumber(data.kpis.visitors.value)} hint="Distinct anonymous ids" delta={<HistoryDelta complete={data.priorComplete} current={data.kpis.visitors.value} previous={data.kpis.visitors.previous} />} />
        <Kpi testId="kpi-sessions" label="Sessions" value={formatNumber(data.kpis.sessions.value)} hint="30-minute sessions" delta={<HistoryDelta complete={data.priorComplete} current={data.kpis.sessions.value} previous={data.kpis.sessions.previous} />} />
        <Kpi testId="kpi-activation" label="Activation" value={formatPercent(data.kpis.activation.value)} hint="Signed up, then used a feature" delta={<HistoryDelta complete={data.priorComplete} current={data.kpis.activation.value} previous={data.kpis.activation.previous} points />} />
      </section>
      <VolumeChart points={data.series} bucket={data.bucket} source={data.volumeSource} />
      <section className="grid gap-3 lg:grid-cols-5">
        <LiveStream events={stream.data?.events ?? []} serverTime={stream.data?.serverTime} />
        <div className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Top events</h2>
          <Ranked
            label="Top events"
            items={data.topEvents.map((event) => ({ key: event.name, label: labelize(event.name), value: event.count }))}
          />
        </div>
      </section>
    </div>
  );
}

function HistoryDelta({
  complete,
  current,
  previous,
  points = false,
}: {
  complete: boolean;
  current: number;
  previous: number;
  points?: boolean;
}) {
  if (!complete) return <span className="delta delta-flat">Short history</span>;
  return <Delta current={current} previous={previous} points={points} />;
}

function LiveStream({
  events,
  serverTime,
}: {
  events: Array<{
    id: string;
    name: string;
    occurredAt: string;
    path: string | null;
    country: string;
    device: string;
    channel: string;
  }>;
  serverTime?: string;
}) {
  const seen = useRef(new Set<string>());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const event of events) {
      if (seen.current.size > 0 && !seen.current.has(event.id)) next.add(event.id);
      seen.current.add(event.id);
    }
    setFresh(next);
  }, [events]);
  const newest = events[0] ? Date.now() - Date.parse(events[0].occurredAt) : Number.POSITIVE_INFINITY;
  const live = newest < 45_000;
  return (
    <section className="card flex max-h-[32rem] flex-col p-4 lg:col-span-3" data-testid="live-stream" aria-label="Live event stream">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className={live ? 'live-dot' : 'stale-dot'} aria-hidden />
          {live ? 'Live' : 'Recent'}
        </h2>
        <span className="text-xs text-[var(--muted)]">{serverTime ? 'Refreshing' : ''}</span>
      </div>
      {!live ? <p className="mb-2 text-sm text-[var(--muted)]">Run npm run simulate to keep this stream moving.</p> : null}
      <ol className="grid gap-1 overflow-auto pr-1">
        {events.length === 0 ? <li className="text-sm text-[var(--muted)]">No events for this segment yet.</li> : null}
        {events.map((event) => (
          <li key={event.id} className={`grid grid-cols-[1fr_auto] gap-2 rounded-xl px-2 py-1.5 ${fresh.has(event.id) ? 'row-new' : ''}`}>
            <div>
              <div className="mono text-sm">{event.name}</div>
              <div className="text-xs text-[var(--muted)]">
                {event.path ?? '—'} · {COUNTRY_NAMES[event.country] ?? event.country} · {event.device} · {event.channel}
              </div>
            </div>
            <Ago iso={event.occurredAt} />
          </li>
        ))}
      </ol>
    </section>
  );
}
