import { AssessmentScreen } from '@/features/core-learning/assessment-history';
import { Suspense } from 'react';

export default function Page() {
  return <Suspense fallback={<p role="status">Memuat riwayat…</p>}><AssessmentScreen /></Suspense>;
}
