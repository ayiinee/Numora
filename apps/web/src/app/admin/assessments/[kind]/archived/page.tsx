import { notFound } from 'next/navigation';
import { AdminAssessmentsScreen } from '@/features/admin/assessments';
import { assessmentTypes } from '@/features/admin/assessment-routes';

export default async function Page({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!Object.hasOwn(assessmentTypes, kind) || kind !== 'tryout') notFound();
  return <AdminAssessmentsScreen usage={assessmentTypes.tryout} archived />;
}
