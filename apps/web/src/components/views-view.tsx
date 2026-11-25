'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { ErrorState, LoadingBlock, PageHeader } from './ui';

export function ViewsView() {
  const views = trpc.views.list.useQuery();
  const utils = trpc.useUtils();
  const remove = trpc.views.delete.useMutation({
    onSuccess: () => utils.views.list.invalidate(),
  });
  if (views.isLoading) return <LoadingBlock />;
  if (views.error) return <ErrorState message={views.error.message} />;
  return (
    <div>
      <PageHeader
        eyebrow="Bookmarks"
        title="Saved views"
        description="A view is a path plus the filters in the URL. Save one from any analytics page."
      />
      {views.data?.length === 0 ? (
        <p className="card p-6 text-[var(--muted)]">No saved views yet. Set a device or date range on Overview and choose Save view.</p>
      ) : (
        <ul className="grid gap-3">
          {views.data?.map((view) => {
            const href = view.query ? `${view.path}?${view.query}` : view.path;
            return (
              <li key={view.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="text-lg font-semibold">{view.name}</h2>
                  <p className="mono text-xs text-[var(--muted)]">{href}</p>
                </div>
                <div className="flex gap-2">
                  <Link className="btn-primary" href={href}>
                    Open
                  </Link>
                  <button type="button" className="btn" aria-label={`Delete ${view.name}`} onClick={() => remove.mutate({ id: view.id })}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
