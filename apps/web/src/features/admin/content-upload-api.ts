import { apiRequest } from '@/lib/api';
import type {
  SaveUploadDraftDto,
  UpdateUploadPreviewDto,
  UploadDetailDto,
  UploadListDto,
} from './generated-types';
export const uploadTemplate = (token: string) =>
  apiRequest<Blob>('admin/content/upload-template', token, undefined, 'blob');
export const listUploads = (token: string, query: string) =>
  apiRequest<UploadListDto>(`admin/content/uploads?${query}`, token);
export const getUpload = (token: string, id: string) =>
  apiRequest<UploadDetailDto>(`admin/content/uploads/${encodeURIComponent(id)}`, token);
export function receiveUpload(token: string, file: File, key: string) {
  const body = new FormData();
  body.append('fileName', file.name);
  body.append('byteLength', String(file.size));
  body.append('file', file);
  return apiRequest<UploadDetailDto>('admin/content/uploads', token, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
  });
}
export const validateUpload = (token: string, id: string, body: UpdateUploadPreviewDto) =>
  apiRequest<UploadDetailDto>(`admin/content/uploads/${id}/preview`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const saveUpload = (token: string, id: string, key: string, body: SaveUploadDraftDto) =>
  apiRequest<UploadDetailDto>(`admin/content/uploads/${id}/draft`, token, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': key },
  });
