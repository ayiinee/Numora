import { AdminTryoutBatchesScreen } from '@/features/admin/tryout-batches';
export default async function Page({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <AdminTryoutBatchesScreen id={batchId} />;
}
