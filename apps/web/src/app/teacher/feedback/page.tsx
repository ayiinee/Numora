import { redirect } from 'next/navigation';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string | string[]; studentId?: string | string[] }>;
}) {
  const { classId, studentId } = await searchParams;
  if (typeof classId !== 'string' || !classId || typeof studentId !== 'string' || !studentId)
    redirect('/teacher');
  redirect(
    `/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}?tab=notes`,
  );
}
