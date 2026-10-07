import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api';
import { loadAdminWorkbench } from './content-api';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));

describe('admin workbench loading', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({ items: [] });
  });

  it('does not request general audit for Content Admin', async () => {
    const result = await loadAdminWorkbench('test-token', 0);
    expect(result.audit).toEqual({ items: [], hasNext: false });
    expect(
      vi.mocked(apiRequest).mock.calls.some(([path]) => path.startsWith('admin/audit-logs')),
    ).toBe(false);
  });

  it('requests domain-scoped audit only on its tab', async () => {
    await loadAdminWorkbench('test-token', 0, 'audit');
    expect(apiRequest).toHaveBeenCalledWith('admin/audit-logs?limit=6&offset=0', 'test-token');
  });

  it('uses server cursors to show five records and detect whether another page exists', async () => {
    const rows = Array.from({ length: 6 }, (_, id) => ({ id }));
    vi.mocked(apiRequest).mockResolvedValue({ items: rows.slice(0, 5), nextOffset: 5 });
    const first = await loadAdminWorkbench('test-token', 0);
    expect(first.versions.items).toEqual(rows.slice(0, 5));
    expect(first.versions.hasNext).toBe(true);

    vi.mocked(apiRequest).mockResolvedValue({ items: rows.slice(1), nextOffset: null });
    const last = await loadAdminWorkbench('test-token', 5);
    expect(apiRequest).toHaveBeenCalledWith(
      'admin/content/versions?limit=5&offset=5',
      'test-token',
    );
    expect(last.versions.items).toHaveLength(5);
    expect(last.versions.hasNext).toBe(false);
  });
});
