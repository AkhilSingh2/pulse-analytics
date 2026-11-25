import { Suspense, type ReactNode } from 'react';
import { Shell } from '@/components/shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--muted)]">Loading Pulse…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
