import type { Metadata } from 'next';
import { PlaygroundView } from '@/components/playground-view';

export const metadata: Metadata = { title: 'Playground' };

export default function Page() {
  return <PlaygroundView />;
}
