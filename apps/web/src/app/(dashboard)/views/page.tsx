import type { Metadata } from 'next';
import { ViewsView } from '@/components/views-view';

export const metadata: Metadata = { title: 'Saved views' };

export default function Page() {
  return <ViewsView />;
}
