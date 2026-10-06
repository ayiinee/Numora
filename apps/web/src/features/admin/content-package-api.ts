import { apiRequest } from '@/lib/api';
import type {
  ContentMutationDto,
  ContentPackageDetailDto,
  ContentPackagesDto,
  CreateContentPackageDto,
  UpdateContentPackageDto,
  ClassifyQuestionDto,
} from './generated-types';
const root = 'admin/content';
export const listContentPackages = (token: string, query = '') =>
  apiRequest<ContentPackagesDto>(`${root}/packages${query ? `?${query}` : ''}`, token);
export const getContentPackage = (token: string, id: string) =>
  apiRequest<ContentPackageDetailDto>(`${root}/packages/${encodeURIComponent(id)}`, token);
export const createContentPackage = (token: string, body: CreateContentPackageDto) =>
  apiRequest<ContentMutationDto>(`${root}/packages`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateContentPackage = (token: string, id: string, body: UpdateContentPackageDto) =>
  apiRequest<ContentMutationDto>(`${root}/packages/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const reviewImportedQuestion = (
  token: string,
  id: string,
  notes: string,
  packageId: string,
) =>
  apiRequest<ContentMutationDto>(`${root}/versions/${encodeURIComponent(id)}/review`, token, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true, notes, packageId }),
  });
export const classifyQuestion = (token: string, id: string, body: ClassifyQuestionDto) =>
  apiRequest<ContentMutationDto>(`${root}/questions/${encodeURIComponent(id)}/usage`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
