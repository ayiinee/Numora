import { redirect } from 'next/navigation';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string | string[] }>;
}) {
  const { classId } = await searchParams;
  redirect(
    typeof classId === 'string' && classId
      ? `/teacher/classes/${encodeURIComponent(classId)}`
      : '/teacher',
  );
}
