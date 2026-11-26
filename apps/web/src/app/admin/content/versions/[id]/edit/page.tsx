import { QuestionEditorScreen } from '@/features/admin/question-editor';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ package?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <QuestionEditorScreen key={`${id}:${query.package ?? ''}`} id={id} packageId={query.package} />
  );
}
