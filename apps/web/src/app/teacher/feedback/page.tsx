import { redirect } from 'next/navigation';
import { TeacherFeedbackScreen } from '@/features/monitoring/teacher-feedback';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string | string[]; studentId?: string | string[] }>;
}) {
  const { classId, studentId } = await searchParams;
  if (typeof classId !== 'string' || !classId || typeof studentId !== 'string' || !studentId)
    redirect('/teacher');
  return <TeacherFeedbackScreen classId={classId} studentId={studentId} />;
}
