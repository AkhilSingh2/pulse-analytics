'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { demoLink } from '@/demo/link';
import { DemoNote } from '@/demo/note';
import { STATIC_DEMO } from '@/demo/flag';

if (STATIC_DEMO && typeof window !== 'undefined') {
  void import('@/demo/runtime').then(({ installDemoRuntime }) => installDemoRuntime());
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 } },
      }),
  );
  const [client] = useState(() =>
    trpc.createClient({
      links: [STATIC_DEMO ? demoLink : httpBatchLink({ url: '/api/trpc' })],
    }),
  );
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        {STATIC_DEMO ? <DemoNote /> : null}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
