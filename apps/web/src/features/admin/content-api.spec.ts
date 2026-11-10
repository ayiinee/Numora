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
    expect(apiRequest).toHaveBeenCalledWith('admin/audit-logs?limit=11&offset=0', 'test-token');
  });

  it('uses server cursors to show ten records and detect whether another page exists', async () => {
    const rows = Array.from({ length: 11 }, (_, id) => ({ id }));
    vi.mocked(apiRequest).mockResolvedValue({ items: rows.slice(0, 10), nextOffset: 10 });
    const first = await loadAdminWorkbench('test-token', 0);
    expect(first.versions.items).toEqual(rows.slice(0, 10));
    expect(first.versions.hasNext).toBe(true);

    vi.mocked(apiRequest).mockResolvedValue({ items: rows.slice(10), nextOffset: null });
    const last = await loadAdminWorkbench('test-token', 10);
    expect(apiRequest).toHaveBeenCalledWith(
      'admin/content/versions?limit=10&offset=10',
      'test-token',
    );
    expect(last.versions.items).toHaveLength(1);
    expect(last.versions.hasNext).toBe(false);
  });

  it('preserves the filtered server total without inferring it from one page', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      items: [{ id: 'first' }],
      total: 23,
      nextOffset: 10,
    });
    const result = await loadAdminWorkbench('test-token', 0, 'reports', { status: 'OPEN' });
    expect(result.reports.total).toBe(23);
    expect(result.reports.items).toHaveLength(1);
    expect(result.reports.hasNext).toBe(true);
    expect(apiRequest).toHaveBeenCalledWith(
      'admin/reports?limit=10&offset=0&status=OPEN',
      'test-token',
    );
  });
});
