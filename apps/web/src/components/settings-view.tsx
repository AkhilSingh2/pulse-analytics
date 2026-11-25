'use client';

import { formatNumber } from '@pulse/shared';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ErrorState, LoadingBlock, PageHeader } from './ui';

export function SettingsView() {
  const settings = trpc.settings.useQuery();
  const [copied, setCopied] = useState('');
  const [origin, setOrigin] = useState('http://localhost:3000');
  useEffect(() => setOrigin(window.location.origin), []);
  if (settings.isLoading) return <LoadingBlock />;
  if (settings.error || !settings.data) return <ErrorState message={settings.error?.message ?? 'Missing settings'} />;
  const { project, stats, rateLimit } = settings.data;
  const snippet = `import { createPulse } from '@pulse/sdk';

const pulse = createPulse({
  apiKey: '${project.apiKey}',
  endpoint: '${origin}/api/ingest',
});

pulse.page();
pulse.track('signup_started', { plan: 'trial' });
pulse.identify('user_42', { plan: 'pro' });`;
  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={project.slug}
        title="Settings"
        description="One demo project, a public ingest key, and the rollups behind the charts."
      />
      <section className="card p-4">
        <h2 className="text-lg font-semibold">Ingest key</h2>
        <p className="lede">Shown on purpose so the browser SDK can post events. Don’t reuse it outside this demo.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="mono rounded-xl bg-[var(--bg)] px-3 py-2 text-sm">{project.apiKey}</code>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(project.apiKey);
              setCopied('Copied');
            }}
          >
            Copy
          </button>
          <span role="status" className="text-sm text-[var(--muted)]">{copied}</span>
        </div>
      </section>
      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-lg font-semibold">SDK</h2>
        <pre className="mono overflow-x-auto text-sm leading-relaxed"><code>{snippet}</code></pre>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Events" value={formatNumber(stats.events)} />
        <Stat label="Hourly rollups" value={formatNumber(stats.hourlyRollups)} />
        <Stat label="Page rollups" value={formatNumber(stats.pageRollups)} />
        <Stat label="Referrer rollups" value={formatNumber(stats.referrerRollups)} />
      </section>
      <section className="card p-4 text-sm leading-6 text-[var(--muted)]">
        <p>Rate limit: {rateLimit.capacity} event burst, refilling {rateLimit.refillPerSecond} per second. Batches cap at {rateLimit.maxBatch}.</p>
        <p>Actor key is the anonymous id. User id is an attribute, so identify does not split a funnel in half.</p>
        <p>Last event: {stats.lastEventAt ? new Date(stats.lastEventAt).toLocaleString() : 'none yet'}.</p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="card p-4">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="display mt-1 text-3xl">{value}</p>
    </article>
  );
}
