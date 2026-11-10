import { notFound } from 'next/navigation';
import { AdminAssessmentsScreen } from '@/features/admin/assessments';
import { assessmentTypes } from '@/features/admin/assessment-routes';

export default async function Page({
  params,
}: {
  params: Promise<{ kind: string; packageId: string }>;
}) {
  const { kind, packageId } = await params;
  if (!Object.hasOwn(assessmentTypes, kind)) notFound();
  return (
    <AdminAssessmentsScreen
      usage={assessmentTypes[kind as keyof typeof assessmentTypes]}
      mode="detail"
      packageId={packageId}
    />
  );
}
