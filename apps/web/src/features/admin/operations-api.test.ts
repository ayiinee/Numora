import { expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api';
import { listAdminClasses, listAdminUsers } from './operations-api';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));

it('requests five users and classes while retaining their search and pagination parameters', async () => {
  await listAdminUsers('TEST', { offset: 5, search: 'Siswa TEST', role: 'STUDENT' });
  expect(apiRequest).toHaveBeenCalledWith(
    'admin/users?limit=5&offset=5&search=Siswa+TEST&role=STUDENT',
    'TEST',
  );
  await listAdminClasses('TEST', { offset: 10, search: 'IX TEST', state: 'active' });
  expect(apiRequest).toHaveBeenCalledWith(
    'admin/classes?limit=5&offset=10&search=IX+TEST&state=active',
    'TEST',
  );
});
