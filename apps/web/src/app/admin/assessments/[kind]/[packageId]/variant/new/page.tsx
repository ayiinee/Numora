import { notFound } from 'next/navigation';
import { AdminTryoutVariantWizard } from '@/features/admin/tryout-variant-wizard';
import { assessmentTypes } from '@/features/admin/assessment-routes';

export default async function Page({
  params,
}: {
  params: Promise<{ kind: string; packageId: string }>;
}) {
  const { kind, packageId } = await params;
  if (kind !== 'tryout' || !packageId || !Object.hasOwn(assessmentTypes, kind)) notFound();
  return <AdminTryoutVariantWizard packageId={packageId} />;
}
