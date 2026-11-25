'use client';

import { formatNumber } from '@pulse/shared';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBucket } from '@/lib/nav';

type Point = { bucket: string; events: number; users: number };

export function VolumeChart({
  points,
  bucket,
  source,
}: {
  points: Point[];
  bucket: 'hour' | 'day';
  source: 'rollup' | 'raw';
}) {
  const data = points.map((point) => ({
    ...point,
    label: formatBucket(point.bucket, bucket),
  }));
  return (
    <section className="card p-4 sm:p-5" data-testid="chart-volume">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Event volume</h2>
          <p className="text-sm text-[var(--muted)]">
            {source === 'rollup'
              ? 'Counts come from hourly rollups. Visitors are distinct anonymous ids from raw events.'
              : 'Country isn’t on the rollup grain, so this series is counted from raw events.'}
          </p>
        </div>
        <div className="flex gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" /> Events
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-full bg-[var(--teal)]" /> Visitors
          </span>
        </div>
      </div>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis yAxisId="events" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={42} />
            <YAxis yAxisId="users" orientation="right" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTip />} />
            <Area yAxisId="events" type="monotone" dataKey="events" name="Events" stroke="var(--accent)" fill="url(#eventsFill)" strokeWidth={2} />
            <Line yAxisId="users" type="monotone" dataKey="users" name="Visitors" stroke="var(--teal)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Event volume and visitors by {bucket}</caption>
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Events</th>
            <th>Visitors</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.bucket}>
              <td>{point.label}</td>
              <td>{point.events}</td>
              <td>{point.users}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-sm">
      <div className="text-[var(--muted)]">{label}</div>
      {payload.map((item) => (
        <div key={item.name} style={{ color: item.color }}>
          {item.name}: {formatNumber(Number(item.value ?? 0))}
        </div>
      ))}
    </div>
  );
}
