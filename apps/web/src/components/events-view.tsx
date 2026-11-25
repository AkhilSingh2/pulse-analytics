'use client';

import { COUNTRY_NAMES, filtersFromSearchParams, shortId } from '@pulse/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Ago, ErrorState, ExportButton, LoadingBlock, PageHeader } from './ui';

export function EventsView() {
  const params = useSearchParams();
  const router = useRouter();
  const query = useMemo(() => filtersFromSearchParams((key) => params.get(key)), [params]);
  const search = params.get('q') ?? '';
  const [draft, setDraft] = useState(search);
  const events = trpc.events.useQuery({ ...query, search: search || undefined }, { placeholderData: keepPreviousData });
  if (events.isLoading && !events.data) return <LoadingBlock />;
  if (events.error) return <ErrorState message={events.error.message} />;
  return (
    <div>
      <PageHeader
        eyebrow="Explorer"
        title="Events"
        description="The latest matching rows. Export sends the same filters as CSV."
        actions={<ExportButton kind="events" />}
      />
      <form
        className="mb-4 flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams(params.toString());
          if (draft.trim()) next.set('q', draft.trim());
          else next.delete('q');
          const queryString = next.toString();
          router.replace(queryString ? `/events?${queryString}` : '/events', { scroll: false });
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Filter by event name</span>
          <input className="input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="page_view" />
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>
      <div className="card overflow-x-auto p-2 sm:p-3">
        <table className="table">
          <caption className="sr-only">Events</caption>
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Visitor</th>
              <th>Path</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {(events.data?.events ?? []).map((event) => (
              <tr key={event.id}>
                <td className="whitespace-nowrap"><Ago iso={event.occurredAt} /></td>
                <td className="mono text-sm">{event.name}</td>
                <td className="text-sm">{shortId(event.userId ?? event.anonymousId)}</td>
                <td className="text-sm">{event.path ?? '—'}</td>
                <td className="text-sm text-[var(--muted)]">
                  {COUNTRY_NAMES[event.country] ?? event.country} · {event.device} · {event.channel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.data?.events.length === 0 ? <p className="p-4 text-sm text-[var(--muted)]">No events match.</p> : null}
      </div>
    </div>
  );
}
