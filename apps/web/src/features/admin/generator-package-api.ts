import { apiRequest } from '@/lib/api';
import type {
  CreateGeneratorPackageDto,
  GeneratorPackageCatalogDto,
  GeneratorPackageDto,
  GeneratorPackageFileDto,
  GeneratorPackagesDto,
  GeneratorJsonPreviewDto,
  GeneratorDraftDto,
} from './generated-types';
const root = 'admin/content/generator/packages';
export const generatorPackageCatalog = (token: string) =>
  apiRequest<GeneratorPackageCatalogDto>(`${root}/catalog`, token);
export const listGeneratorPackages = (token: string) =>
  apiRequest<GeneratorPackagesDto>(root, token);
export const getGeneratorPackage = (token: string, id: string) =>
  apiRequest<GeneratorPackageDto>(`${root}/${id}`, token);
export const getGeneratorPackageFile = (token: string, id: string) =>
  apiRequest<GeneratorPackageFileDto>(`${root}/${id}/file`, token);
export const createGeneratorPackage = (
  token: string,
  key: string,
  body: CreateGeneratorPackageDto,
) =>
  apiRequest<GeneratorPackageDto>(root, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
export const retryGeneratorPackage = (token: string, id: string, key: string) =>
  apiRequest<GeneratorPackageDto>(`${root}/${id}/retry`, token, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  });
export const validateGeneratorJson = (token: string, id: string, file: object) =>
  apiRequest<GeneratorJsonPreviewDto>(`${root}/${id}/validate-json`, token, {
    method: 'POST',
    body: JSON.stringify({ file }),
  });
export const importGeneratorJson = (token: string, id: string, file: object) =>
  apiRequest<GeneratorDraftDto>(`${root}/${id}/import-json`, token, {
    method: 'POST',
    body: JSON.stringify({ file }),
  });
