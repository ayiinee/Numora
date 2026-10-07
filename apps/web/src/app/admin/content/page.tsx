import { AdminContentScreen, type ContentView } from '@/features/admin/content';
export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
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
