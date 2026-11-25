'use client';

import { createPulse, type PulseClient } from '@pulse/sdk';
import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ErrorState, LoadingBlock } from './ui';

const ACTIONS = [
  { label: 'View pricing', run: (pulse: PulseClient) => pulse.page('/pricing') },
  { label: 'Start signup', run: (pulse: PulseClient) => pulse.track('signup_started', { path: '/signup' }) },
  { label: 'Complete signup', run: (pulse: PulseClient) => pulse.track('signup_completed', { path: '/signup', method: 'email' }) },
  { label: 'Use boards', run: (pulse: PulseClient) => pulse.track('feature_used', { path: '/app/boards', feature: 'boards' }) },
  { label: 'Click upgrade', run: (pulse: PulseClient) => pulse.track('upgrade_clicked', { path: '/pricing', plan: 'pro' }) },
  { label: 'Subscribe', run: (pulse: PulseClient) => pulse.track('subscription_started', { path: '/app/billing', plan: 'pro' }) },
];

export function PlaygroundView() {
  const settings = trpc.settings.useQuery();
  const pulseRef = useRef<PulseClient | null>(null);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    if (!settings.data) return;
    const pulse = createPulse({
      apiKey: settings.data.project.apiKey,
      endpoint: `${window.location.origin}/api/ingest`,
      flushIntervalMs: 600,
    });
    pulseRef.current = pulse;
    pulse.page('/playground');
    setLog((items) => ['page /playground', ...items].slice(0, 12));
    return () => {
      void pulse.shutdown();
    };
  }, [settings.data]);
  if (settings.isLoading) return <LoadingBlock />;
  if (settings.error || !settings.data) return <ErrorState message={settings.error?.message ?? 'Missing project'} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="card p-6">
        <p className="eyebrow">Northstar</p>
        <h1 className="display mt-2 text-5xl">See the product. Send the event.</h1>
        <p className="lede">These buttons call @pulse/sdk in the browser. Open Overview to watch them land.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="btn-primary"
              onClick={() => {
                const pulse = pulseRef.current;
                if (!pulse) return;
                action.run(pulse);
                setLog((items) => [action.label, ...items].slice(0, 12));
                void pulse.flush();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
      <section className="card p-4">
        <h2 className="text-lg font-semibold">SDK log</h2>
        <ol className="mono mt-3 grid gap-2 text-sm" aria-live="polite">
          {log.length === 0 ? <li className="text-[var(--muted)]">Waiting for a click.</li> : null}
          {log.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ol>
      </section>
      </div>
  );
}
