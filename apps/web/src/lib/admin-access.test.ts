import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, getIdentity } from './api';
afterEach(() => vi.unstubAllGlobals());
it('discards an otherwise allowed response and refreshes identity when the persisted sub-role changes', async () => {
  const listener = vi.fn();
  window.addEventListener('numora:authorization-changed', listener);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ role: 'ADMIN', adminRole: 'SUPER_ADMIN' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'X-Numora-Admin-Role': 'OPERATIONS' },
        }),
      ),
  );
  try {
    await getIdentity('TEST ONLY');
    await expect(apiRequest('admin/users', 'TEST ONLY')).rejects.toMatchObject({
      code: 'ADMIN_ACCESS_CHANGED',
    });
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('numora:authorization-changed', listener);
  }
});
