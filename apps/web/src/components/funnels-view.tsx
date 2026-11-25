'use client';

import { EVENT_CATALOG, FUNNEL_PRESETS, filtersFromSearchParams, formatDuration, formatNumber, formatPercent, labelize, presetSteps } from '@pulse/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { ErrorState, LoadingBlock, PageHeader } from './ui';

export function FunnelsView() {
  const params = useSearchParams();
  const router = useRouter();
  const query = useMemo(() => filtersFromSearchParams((key) => params.get(key)), [params]);
  const steps = useMemo(() => {
    const raw = params.get('steps');
    if (raw) {
      const parsed = raw.split(',').filter((step) => /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(step));
      if (parsed.length >= 2) return parsed.slice(0, 6);
    }
    return presetSteps(params.get('funnel'));
  }, [params]);
  const funnel = trpc.funnel.useQuery({ ...query, steps }, { placeholderData: keepPreviousData });

  function update(next: string[], preset?: string | null) {
    const search = new URLSearchParams(params.toString());
    search.set('steps', next.join(','));
    if (preset) search.set('funnel', preset);
    else search.delete('funnel');
    router.replace(`/funnels?${search.toString()}`, { scroll: false });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const current = next[index]!;
    next[index] = next[target]!;
    next[target] = current;
    update(next);
  }

  if (funnel.isLoading && !funnel.data) return <LoadingBlock />;
  if (funnel.error) return <ErrorState message={funnel.error.message} />;
  const rows = funnel.data?.steps ?? [];
  const first = rows[0]?.users ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Ordered conversion"
        title="Funnels"
        description="A visitor only reaches a step after the previous one. Times are medians between those matches."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FUNNEL_PRESETS.map((preset) => (
          <button key={preset.id} type="button" className="btn" aria-pressed={params.get('funnel') === preset.id} onClick={() => update([...preset.steps], preset.id)}>
            {preset.name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="card p-3">
          <h2 className="px-1 text-sm font-semibold">Steps</h2>
          <ol className="mt-2 grid gap-2">
            {steps.map((step, index) => (
              <li key={`${step}-${index}`} className="flex items-center gap-1 rounded-xl border border-[var(--line)] px-2 py-1">
                <span className="flex-1 text-sm">{labelize(step)}</span>
                <button type="button" className="btn-ghost min-h-8 px-2" aria-label={`Move ${labelize(step)} up`} onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button type="button" className="btn-ghost min-h-8 px-2" aria-label={`Move ${labelize(step)} down`} onClick={() => move(index, 1)}>
                  ↓
                </button>
                <button type="button" className="btn-ghost min-h-8 px-2" aria-label={`Remove ${labelize(step)}`} onClick={() => steps.length > 2 && update(steps.filter((_, item) => item !== index))}>
                  ×
                </button>
              </li>
            ))}
          </ol>
          <label className="mt-3 block text-sm">
            <span className="sr-only">Add step</span>
            <select
              className="select w-full"
              aria-label="Add step"
              value=""
              onChange={(event) => {
                if (!event.target.value || steps.length >= 6) return;
                update([...steps, event.target.value]);
              }}
            >
              <option value="">Add step</option>
              {EVENT_CATALOG.filter((event) => !steps.includes(event.name)).map((event) => (
                <option key={event.name} value={event.name}>
                  {event.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="card p-4 sm:p-5" data-testid="funnel">
          <ol className="grid gap-3">
            {rows.map((step, index) => {
              const width = first === 0 ? 0 : Math.max(8, (step.users / first) * 100);
              return (
                <li key={step.step}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="font-medium">{labelize(step.step)}</span>
                    <span className="mono text-sm text-[var(--muted)]">
                      {formatNumber(step.users)} · {formatPercent(step.conversionFromStart)}
                    </span>
                  </div>
                  <div className="h-10 overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]" aria-hidden>
                    <div className="flex h-full items-center overflow-hidden rounded-xl bg-[var(--accent)] px-3 text-sm text-[var(--accent-ink)]" style={{ width: `${width}%` }}>
                      {width > 32 ? (index === 0 ? '100%' : formatPercent(step.conversionFromPrev)) : ''}
                    </div>
                  </div>
                  {index > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {formatPercent(step.conversionFromPrev)} of the previous step · median {formatDuration(step.medianMillisFromPrev)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
