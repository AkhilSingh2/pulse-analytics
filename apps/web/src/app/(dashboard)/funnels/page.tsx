import type { Metadata } from 'next';
import { FunnelsView } from '@/components/funnels-view';

export const metadata: Metadata = { title: 'Funnels' };

export default function Page() {
  return <FunnelsView />;
}
