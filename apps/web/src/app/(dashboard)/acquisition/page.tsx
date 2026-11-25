import type { Metadata } from 'next';
import { AcquisitionView } from '@/components/acquisition-view';

export const metadata: Metadata = { title: 'Acquisition' };

export default function Page() {
  return <AcquisitionView />;
}
