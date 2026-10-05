import { TeacherClassToolsScreen } from '@/features/monitoring/teacher-class-tools';

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <TeacherClassToolsScreen classId={classId} mode="invite" />;
}
