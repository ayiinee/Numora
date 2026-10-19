import { ContentReviewScreen } from '@/features/admin/content-review';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContentReviewScreen id={id} />;
}
