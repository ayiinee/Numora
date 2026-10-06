import { apiRequest } from '@/lib/api';
import { ADMIN_PAGE_SIZE } from './pagination';
import type {
  AdminClassDto,
  AdminClassListDto,
  AdminUserDto,
  AdminUserListDto,
} from './generated-types';

function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  query.set('limit', String(ADMIN_PAGE_SIZE));
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return `?${query.toString()}`;
}

export const listAdminUsers = (
  token: string,
  filters: { offset: number; search?: string; role?: string; status?: string },
) => apiRequest<AdminUserListDto>(`admin/users${queryString(filters)}`, token);

export const getAdminUser = (token: string, userId: string) =>
  apiRequest<AdminUserDto>(`admin/users/${encodeURIComponent(userId)}`, token);

export const listAdminClasses = (
  token: string,
  filters: {
    offset: number;
    search?: string;
    schoolId?: string;
    teacherId?: string;
    state?: string;
  },
) => apiRequest<AdminClassListDto>(`admin/classes${queryString(filters)}`, token);

export const getAdminClass = (token: string, classId: string) =>
  apiRequest<AdminClassDto>(`admin/classes/${encodeURIComponent(classId)}`, token);
