'use client';

import { filtersFromSearchParams, labelize } from '@pulse/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { ErrorState, ExportButton, LoadingBlock, PageHeader, Ranked } from './ui';

export function AcquisitionView() {
  const params = useSearchParams();
  const query = useMemo(() => filtersFromSearchParams((key) => params.get(key)), [params]);
  const dataQuery = trpc.acquisition.useQuery(query, { placeholderData: keepPreviousData });
  if (dataQuery.isLoading && !dataQuery.data) return <LoadingBlock />;
  if (dataQuery.error) return <ErrorState message={dataQuery.error.message} />;
  const data = dataQuery.data;
  if (!data) return null;
  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow={data.source === 'rollup' ? 'Daily rollups' : 'Raw events'}
        title="Acquisition"
        description="Where people land, and which channel brought them. Segment filters read raw events so the grain stays honest."
        actions={<ExportButton kind="pages" />}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-lg font-semibold">Top pages</h2>
          <Ranked label="Top pages" items={data.pages.map((row) => ({ key: row.path, label: row.path, value: row.views }))} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-lg font-semibold">Top referrers</h2>
          <Ranked label="Top referrers" items={data.referrers.map((row) => ({ key: row.host, label: row.host, value: row.views }))} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-lg font-semibold">Devices</h2>
          <Ranked label="Devices" items={data.devices.map((row) => ({ key: row.device, label: labelize(row.device), value: row.events }))} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-lg font-semibold">Channels</h2>
          <Ranked label="Channels" items={data.channels.map((row) => ({ key: row.channel, label: labelize(row.channel), value: row.events }))} />
        </section>
      </div>
    </div>
  );
}
