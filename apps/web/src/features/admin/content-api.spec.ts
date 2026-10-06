import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api';
import { loadAdminWorkbench } from './content-api';

vi.mock('@/lib/api', () => ({
  apiRequest: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe('loadAdminWorkbench', () => {
  it('does not request Super Admin audit logs for Content Admin', async () => {
    const paths: string[] = [];
    vi.mocked(apiRequest).mockImplementation(async <T>(path: string): Promise<T> => {
      paths.push(path);
      if (path === 'admin/dashboard')
        return {
          schools: 0,
          chapters: 0,
          questions: 0,
          readyVersions: 0,
          openReports: 0,
        } as T;
      return { items: [] } as T;
    });

    const workbench = await loadAdminWorkbench('access-token', 0, false);

    expect(paths).not.toContain('admin/audit-logs?limit=20&offset=0');
    expect(workbench.audit).toBeNull();
    expect(paths).toContain('admin/content/curriculum');
    expect(paths).toContain('admin/reports?limit=20&offset=0');
    expect(paths).toContain('admin/irt?limit=20&offset=0');
    expect(paths).toContain('admin/dashboard');
  });

  it('requests audit logs for Super Admin', async () => {
    const paths: string[] = [];
    vi.mocked(apiRequest).mockImplementation(async <T>(path: string): Promise<T> => {
      paths.push(path);
      return { items: [] } as T;
    });

    await loadAdminWorkbench('access-token', 20, true);

    expect(paths).toContain('admin/audit-logs?limit=20&offset=20');
  });
});
