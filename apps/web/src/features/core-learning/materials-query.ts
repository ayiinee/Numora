import { queryOptions } from '@tanstack/react-query';
import { request } from './api';
import type { StudentMaterialsDto } from './generated-types';

export function studentMaterialsQuery(token: string) {
  return queryOptions({
    queryKey: ['student-materials'],
    queryFn: () => request<StudentMaterialsDto>(token, '/students/me/materials'),
  });
}
