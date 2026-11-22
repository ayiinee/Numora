import { apiRequest } from '@/lib/api';
import type {
  CreateTryoutVariantDto,
  TryoutVariantOptionsDto,
  TryoutVariantProcessDto,
} from './generated-types';

const root = 'admin/assessments/tryout';
export const getTryoutVariantOptions = (token: string, packageId: string, anchors: string[] = []) =>
  apiRequest<TryoutVariantOptionsDto>(
    `${root}/${encodeURIComponent(packageId)}/variant-options${anchors.length ? `?anchors=${encodeURIComponent(anchors.join(','))}` : ''}`,
    token,
  );

export const createTryoutVariant = (
  token: string,
  packageId: string,
  body: CreateTryoutVariantDto,
) =>
  apiRequest<TryoutVariantProcessDto>(`${root}/${encodeURIComponent(packageId)}/variants`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getTryoutVariantProcess = (token: string, id: string) =>
  apiRequest<TryoutVariantProcessDto>(`${root}/variant-processes/${encodeURIComponent(id)}`, token);

export const materializeTryoutVariant = (token: string, id: string) =>
  apiRequest<{ id: string }>(
    `${root}/variant-processes/${encodeURIComponent(id)}/materialize`,
    token,
    { method: 'POST' },
  );
