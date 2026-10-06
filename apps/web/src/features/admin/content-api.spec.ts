import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api';
import { loadAdminWorkbench } from './content-api';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ items: [] });
});

it('loads content without requesting restricted audit logs by default', async () => {
  const data = await loadAdminWorkbench('test-token', 0);
  expect(apiRequest).not.toHaveBeenCalledWith(
    expect.stringContaining('audit-logs'),
    expect.anything(),
  );
  expect(data.audit).toBeNull();
  expect(apiRequest).toHaveBeenCalledWith('admin/content/curriculum', 'test-token');
});

it('includes audit logs when the caller has Super Admin access', async () => {
  const data = await loadAdminWorkbench('test-token', 0, '', true);
  expect(apiRequest).toHaveBeenCalledWith('admin/audit-logs?limit=20&offset=0', 'test-token');
  expect(data.audit).toEqual({ items: [] });
});
