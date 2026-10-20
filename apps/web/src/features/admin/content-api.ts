import { apiRequest } from '@/lib/api';
import { ADMIN_PAGE_SIZE, adminPage } from './pagination';
import type {
  AdminAuditListDto,
  AdminCurriculumDto,
  AdminDashboardDto,
  AdminDrillPackagesDto,
  AdminIrtDto,
  AdminIrtBatchesDto,
  AdminReportsDto,
  AdminTryoutDraftsDto,
  AdminVersionsDto,
  AdminVideosDto,
  ContentMutationDto,
  CreateChapterDto,
  CreateCompetencyDto,
  CreateDrillPackageDto,
  CreateLevelDto,
  CreateQuestionDto,
  CreateSubchapterDto,
  CreateTryoutDraftDto,
  CreateVariantDto,
  CreateVideoDto,
  QuestionContentDto,
  ResolveReportDto,
  UpdateTryoutDraftDto,
  UpdateDrillPackageDto,
} from './generated-types';
import type { AdminTaxonDto, UpdateVideoDto } from './generated-types';

export async function loadAdminWorkbench(
  token: string,
  offset: number,
  versionQuery = '',
  includeAudit = false,
  reportQuery = '',
) {
  const page = `?limit=${ADMIN_PAGE_SIZE + 1}&offset=${offset}`;
  const reportPage = `admin/reports${page}${reportQuery ? `&${reportQuery}` : ''}`;
  const [
    curriculum,
    versions,
    videos,
    reports,
    irt,
    irtBatches,
    audit,
    dashboard,
    packages,
    drillPackages,
  ] = await Promise.all([
    apiRequest<AdminCurriculumDto>('admin/content/curriculum', token),
    apiRequest<AdminVersionsDto>(
      `admin/content/versions${page}${versionQuery ? `&${versionQuery}` : ''}`,
      token,
    ),
    apiRequest<AdminVideosDto>(`admin/content/videos${page}`, token),
    apiRequest<AdminReportsDto>(reportPage, token),
    apiRequest<AdminIrtDto>(`admin/irt${page}`, token),
    apiRequest<AdminIrtBatchesDto>(`admin/irt/batches${page}`, token),
    includeAudit
      ? apiRequest<AdminAuditListDto>(`admin/audit-logs${page}`, token)
      : Promise.resolve({ items: [], total: 0 } satisfies AdminAuditListDto),
    apiRequest<AdminDashboardDto>('admin/dashboard', token),
    apiRequest<AdminTryoutDraftsDto>(`admin/content/tryout-packages${page}`, token),
    apiRequest<AdminDrillPackagesDto>(`admin/content/drill-packages${page}`, token),
  ]);
  return {
    curriculum,
    versions: { ...adminPage(versions.items, versions.total, offset), total: versions.total },
    videos: { ...adminPage(videos.items, videos.total, offset), total: videos.total },
    reports: { ...adminPage(reports.items, reports.total, offset), total: reports.total },
    irt: { ...adminPage(irt.items, irt.total, offset), total: irt.total },
    irtBatches: {
      ...adminPage(irtBatches.items, irtBatches.total, offset),
      total: irtBatches.total,
    },
    audit: { ...adminPage(audit.items, audit.total, offset), total: audit.total },
    dashboard,
    packages: { ...adminPage(packages.items, packages.total, offset), total: packages.total },
    drillPackages: {
      ...adminPage(drillPackages.items, drillPackages.total, offset),
      total: drillPackages.total,
    },
  };
}
function mutation(token: string, path: string, body: object, method = 'POST') {
  return apiRequest<ContentMutationDto>(path, token, { method, body: JSON.stringify(body) });
}
export const createChapter = (t: string, b: CreateChapterDto) =>
  mutation(t, 'admin/content/chapters', b);
export const createSubchapter = (t: string, b: CreateSubchapterDto) =>
  mutation(t, 'admin/content/subchapters', b);
export const createCompetency = (t: string, b: CreateCompetencyDto) =>
  mutation(t, 'admin/content/competencies', b);
export const createLevel = (t: string, b: CreateLevelDto) => mutation(t, 'admin/content/levels', b);
export const createQuestion = (t: string, b: CreateQuestionDto) =>
  mutation(t, 'admin/content/questions', b);
export const reviseQuestion = (t: string, id: string, b: QuestionContentDto) =>
  mutation(t, `admin/content/versions/${encodeURIComponent(id)}/revisions`, b);
export const createVariant = (t: string, id: string, b: CreateVariantDto) =>
  mutation(t, `admin/content/questions/${encodeURIComponent(id)}/variants`, b);
export const createVideo = (t: string, b: CreateVideoDto) => mutation(t, 'admin/content/videos', b);
export const updateVideo = (t: string, id: string, b: UpdateVideoDto) =>
  mutation(t, `admin/content/videos/${encodeURIComponent(id)}`, b, 'PATCH');
export function renameTaxon(token: string, taxon: AdminTaxonDto, name: string) {
  const resource = {
    CHAPTER: 'chapters',
    SUBCHAPTER: 'subchapters',
    COMPETENCY: 'competencies',
    LEVEL: 'levels',
  }[taxon.kind];
  return mutation(
    token,
    `admin/content/${resource}/${encodeURIComponent(taxon.id)}`,
    taxon.kind === 'CHAPTER' || taxon.kind === 'SUBCHAPTER' ? { name } : { description: name },
    'PATCH',
  );
}
export const createTryoutDraft = (t: string, b: CreateTryoutDraftDto) =>
  mutation(t, 'admin/content/tryout-packages', b);
export const createDrillPackage = (t: string, b: CreateDrillPackageDto) =>
  mutation(t, 'admin/content/drill-packages', b);
export const updateDrillPackage = (t: string, id: string, b: UpdateDrillPackageDto) =>
  mutation(t, `admin/content/drill-packages/${encodeURIComponent(id)}`, b, 'PATCH');
export const publishDrillPackage = (t: string, id: string) =>
  mutation(t, `admin/content/drill-packages/${encodeURIComponent(id)}/publish`, {});
export const archiveDrillPackage = (t: string, id: string) =>
  mutation(t, `admin/content/drill-packages/${encodeURIComponent(id)}/archive`, {});
export const updateTryoutDraft = (t: string, id: string, b: UpdateTryoutDraftDto) =>
  mutation(t, `admin/content/tryout-packages/${encodeURIComponent(id)}`, b, 'PATCH');
export const resolveReport = (
  t: string,
  kind: 'QUESTION' | 'VIDEO',
  id: string,
  b: ResolveReportDto,
) => mutation(t, `admin/reports/${kind}/${encodeURIComponent(id)}`, b, 'PATCH');

export function setContentStatus(
  token: string,
  resource:
    'chapters' | 'subchapters' | 'competencies' | 'levels' | 'questions' | 'versions' | 'videos',
  id: string,
  status: 'DRAFT' | 'READY' | 'ARCHIVED',
) {
  const suffix = resource === 'questions' || resource === 'versions' ? '/status' : '';
  return mutation(
    token,
    `admin/content/${resource}/${encodeURIComponent(id)}${suffix}`,
    { status },
    'PATCH',
  );
}

export const setChapterCategory = (token: string, id: string, materialCategory: string | null) =>
  mutation(
    token,
    `admin/content/chapters/${encodeURIComponent(id)}`,
    { materialCategory },
    'PATCH',
  );
