'use client';

import { formatAgo, formatDelta, formatNumber, formatPoints } from '@pulse/shared';
import { Download } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display h-page">{title}</h1>
        <p className="lede">{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function Delta({
  current,
  previous,
  points = false,
}: {
  current: number;
  previous: number;
  points?: boolean;
}) {
  if (previous === 0 && current === 0) return <span className="delta delta-flat">—</span>;
  const delta = points ? formatPoints(current, previous) : formatDelta(current, previous);
  if (!delta) return <span className="delta delta-flat">New</span>;
  return <span className={`delta delta-${delta.direction}`}>{delta.text} vs prior</span>;
}

export function Kpi({
  testId,
  label,
  value,
  hint,
  delta,
}: {
  testId: string;
  label: string;
  value: string;
  hint: string;
  delta: ReactNode;
}) {
  return (
    <article className="card p-4" data-testid={testId}>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="display mt-2 text-4xl leading-none">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {delta}
        <span className="text-xs text-[var(--muted)]">{hint}</span>
      </div>
    </article>
  );
}

export function LoadingBlock() {
  return (
    <div className="grid gap-3" aria-busy="true">
      <span className="sr-only">Loading analytics</span>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton h-28" />
        ))}
      </div>
      <div className="skeleton h-80" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card p-6" role="alert">
      <h2 className="display text-3xl">Pulse can’t read the warehouse</h2>
      <p className="lede">{message}</p>
    </div>
  );
}

export function ExportButton({ kind }: { kind: 'events' | 'pages' | 'referrers' }) {
  const params = useSearchParams();
  const query = new URLSearchParams(params.toString());
  query.set('kind', kind);
  const label = kind === 'events' ? 'Export events' : kind === 'pages' ? 'Export pages' : 'Export referrers';
  return (
    <a className="btn" href={`/api/export?${query.toString()}`} data-testid="export-csv">
      <Download size={16} aria-hidden />
      {label}
    </a>
  );
}

export function Ranked({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; value: number }>;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) return <p className="text-sm text-[var(--muted)]">Nothing in this range.</p>;
  return (
    <ol className="grid gap-3" aria-label={label}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="mono text-[var(--muted)]">{formatNumber(item.value)}</span>
          </div>
          <div className="meter" aria-hidden>
            <span style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Ago({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => new Date(iso).toISOString().slice(11, 16) + ' UTC');
  useEffect(() => {
    const tick = () => setLabel(formatAgo(iso));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [iso]);
  return (
    <time className="mono text-xs text-[var(--muted)]" dateTime={iso}>
      {label}
    </time>
  );
}
