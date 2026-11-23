import { notFound } from 'next/navigation';
import { AdminAssessmentsScreen } from '@/features/admin/assessments';

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== 'tryout') notFound();
  return <AdminAssessmentsScreen usage="TRYOUT" archived />;
}
