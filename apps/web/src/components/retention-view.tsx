'use client';

import { filtersFromSearchParams, formatNumber, formatPercent } from '@pulse/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { formatCohort } from '@/lib/nav';
import { trpc } from '@/lib/trpc';
import { ErrorState, LoadingBlock, PageHeader } from './ui';

export function RetentionView() {
  const params = useSearchParams();
  const query = useMemo(() => filtersFromSearchParams((key) => params.get(key)), [params]);
  const retention = trpc.retention.useQuery(query, { placeholderData: keepPreviousData });
  if (retention.isLoading && !retention.data) return <LoadingBlock />;
  if (retention.error) return <ErrorState message={retention.error.message} />;
  const data = retention.data;
  if (!data) return null;
  const columns = data.rows[0]?.cells.length ?? (data.grain === 'week' ? 8 : 14);
  const noun = data.grain === 'week' ? 'Week' : 'Day';
  return (
    <div>
      <PageHeader
        eyebrow={data.grain === 'week' ? 'Weekly cohorts' : 'Daily cohorts'}
        title="Retention"
        description="Cohorts start on the visitor’s first event in this segment. Later cells are the share who did anything in that period. A star means the period is still open."
      />
      <div className="card overflow-x-auto p-3 sm:p-4" data-testid="retention">
        <table className="retention table">
          <caption className="sr-only">Retention by {data.grain}</caption>
          <thead>
            <tr>
              <th>Cohort</th>
              {Array.from({ length: columns }, (_, index) => (
                <th key={index} className="text-center">
                  {noun} {index}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={columns + 1}>No cohorts in this range.</td>
              </tr>
            ) : null}
            {data.rows.map((row) => (
              <tr key={row.cohortStart}>
                <th scope="row">
                  <div>{formatCohort(row.cohortStart)}</div>
                  <div className="text-xs font-normal text-[var(--muted)]">{formatNumber(row.size)} visitors</div>
                </th>
                {row.cells.map((cell, index) => (
                  <td key={index}>
                    {cell ? (
                      <div
                        className="cell px-1 py-2"
                        style={{
                          background: `color-mix(in oklab, var(--accent) ${Math.round(cell.rate * 100)}%, var(--bg-elev))`,
                          color: cell.rate > 0.62 ? 'var(--accent-ink)' : 'var(--ink)',
                        }}
                        title={`${cell.users} visitors · ${formatPercent(cell.rate)}`}
                      >
                        {formatPercent(cell.rate, 0)}
                        {cell.partial ? <span className="partial-mark">*</span> : null}
                      </div>
                    ) : (
                      <div className="cell text-[var(--muted)]">–</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
