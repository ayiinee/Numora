import { ContentPreviewScreen } from '@/features/admin/content-preview';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContentPreviewScreen id={id} />;
}
