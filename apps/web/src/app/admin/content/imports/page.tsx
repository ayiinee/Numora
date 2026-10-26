import { ContentImportScreen } from '@/features/admin/content-import';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ generatorPackage?: string; mode?: string }>;
}) {
  const { generatorPackage, mode } = await searchParams;
  return (
    <ContentImportScreen
      {...(typeof mode === 'string' ? { mode } : {})}
      {...(typeof generatorPackage === 'string' ? { generatorPackageId: generatorPackage } : {})}
    />
  );
}
