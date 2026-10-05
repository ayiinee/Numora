import { apiRequest } from '@/lib/api';
import type {
  ImportBodyDto,
  ImportReportDto,
  CreatePreviewDto,
  SavePreviewAnswerDto,
  PreviewAckDto,
  PreviewSessionDto,
  MediaLinkRequestDto,
  MediaLinksDto,
} from './generated-types';
const root = 'admin/content';
const mutation = <T>(token: string, path: string, body: object, key?: string, method = 'POST') =>
  apiRequest<T>(`${root}/${path}`, token, {
    method,
    body: JSON.stringify(body),
    headers: key ? { 'Idempotency-Key': key } : {},
  });
export const validateImport = (token: string, body: ImportBodyDto) =>
  mutation<ImportReportDto>(token, 'import-validations', body);
export const importContent = (token: string, body: ImportBodyDto, key: string) =>
  mutation<ImportReportDto>(token, 'imports', body, key);
export const createPreview = (token: string, body: CreatePreviewDto, key: string) =>
  mutation<PreviewSessionDto>(token, 'preview-sessions', body, key);
export const getPreview = (token: string, id: string, review = false) =>
  apiRequest<PreviewSessionDto>(
    `${root}/preview-sessions/${encodeURIComponent(id)}${review ? '/result' : ''}`,
    token,
  );
export const savePreview = (
  token: string,
  id: string,
  instanceId: string,
  body: SavePreviewAnswerDto,
) =>
  mutation<PreviewAckDto>(
    token,
    `preview-sessions/${encodeURIComponent(id)}/answers/${encodeURIComponent(instanceId)}`,
    body,
    undefined,
    'PATCH',
  );
export const submitPreview = (token: string, id: string, key: string) =>
  mutation<PreviewSessionDto>(token, `preview-sessions/${encodeURIComponent(id)}/submit`, {}, key);
export const renewPreviewMedia = (token: string, id: string, body: MediaLinkRequestDto) =>
  mutation<MediaLinksDto>(token, `preview-sessions/${encodeURIComponent(id)}/media-links`, body);
