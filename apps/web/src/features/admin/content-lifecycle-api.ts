import { apiRequest } from '@/lib/api';
import type { ContentVersionMediaLinksDto } from './generated-types';

export const getContentVersionMedia = (token: string, id: string) =>
  apiRequest<ContentVersionMediaLinksDto>(
    `admin/content/versions/${encodeURIComponent(id)}/media-links`,
    token,
  );
