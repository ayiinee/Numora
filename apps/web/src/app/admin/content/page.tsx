import { AdminContentScreen, type ContentView } from '@/features/admin/content';
import { redirect } from 'next/navigation';
import {
  legacyAssessmentDestination,
  type AssessmentUsage,
} from '@/features/admin/assessment-routes';
export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { view } = params;
  const types: Record<string, string> = {
    packages: 'TRYOUT',
    drillPackages: 'DRILL',
    drill: 'DRILL',
    directedPackages: 'PRETEST',
  };
  if (typeof view === 'string' && types[view]) {
    const query = new URLSearchParams({ type: types[view]! });
    for (const [key, value] of Object.entries(params))
      if (key !== 'view' && typeof value === 'string') query.set(key, value);
    redirect(legacyAssessmentDestination(query, types[view] as AssessmentUsage));
  }
  if (view === 'irt') redirect('/admin/irt');
  const allowed: ContentView[] = [
    'curriculum',
    'questions',
    'verification',
    'videos',
    'packages',
    'drillPackages',
    'reports',
    'irt',
    'audit',
  ];
  const selected = allowed.find((value) => value === view) ?? 'questions';
  return <AdminContentScreen key={selected} initialView={selected} />;
}
