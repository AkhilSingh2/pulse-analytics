import type { Metadata } from 'next';
import { RetentionView } from '@/components/retention-view';

export const metadata: Metadata = { title: 'Retention' };

export default function Page() {
  return <RetentionView />;
}
