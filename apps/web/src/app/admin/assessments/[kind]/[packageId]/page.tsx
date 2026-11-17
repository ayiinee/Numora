import { notFound } from 'next/navigation';
import { AdminAssessmentsScreen } from '@/features/admin/assessments';
import { assessmentTypes } from '@/features/admin/assessment-routes';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; packageId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { kind, packageId } = await params;
  const { status } = await searchParams;
  if (!Object.hasOwn(assessmentTypes, kind)) notFound();
  return (
    <AdminAssessmentsScreen
      usage={assessmentTypes[kind as keyof typeof assessmentTypes]}
      mode="detail"
      packageId={packageId}
      archived={status === 'ARCHIVED'}
    />
  );
}
