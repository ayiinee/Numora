import { ContentImportScreen } from '@/features/admin/content-import';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ generatorPackage?: string }>;
}) {
  const { generatorPackage } = await searchParams;
  return (
    <ContentImportScreen
      {...(typeof generatorPackage === 'string' ? { generatorPackageId: generatorPackage } : {})}
    />
  );
}
