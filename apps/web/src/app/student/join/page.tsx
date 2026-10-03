import { ClassJoinScreen } from '@/features/onboarding/class-join';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const value = (await searchParams).code;
  return <ClassJoinScreen code={Array.isArray(value) ? value[0] : value} />;
}
