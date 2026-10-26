import { notFound } from 'next/navigation';
import { ReportDetailScreen } from '@/features/admin/report-detail';
export default async function Page({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== 'QUESTION' && kind !== 'VIDEO') notFound();
  return <ReportDetailScreen kind={kind} id={id} />;
}
