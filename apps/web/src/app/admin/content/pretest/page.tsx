import { redirect } from 'next/navigation';
import { legacyAssessmentDestination } from '@/features/admin/assessment-routes';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ type: 'PRETEST' });
  for (const [key, value] of Object.entries(params))
    if (typeof value === 'string')
      query.set(['id', 'pretest', 'packageId'].includes(key) ? 'package' : key, value);
  query.set('type', 'PRETEST');
  redirect(legacyAssessmentDestination(query, 'PRETEST'));
}
