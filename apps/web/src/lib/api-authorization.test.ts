import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

it('leaves disabled identity resolution to Auth without recursively invalidating it', async () => {
  const listener = vi.fn();
  window.addEventListener('numora:authorization-changed', listener);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'ACCOUNT_DISABLED' }), { status: 403 }),
      ),
  );
  try {
    await expect(apiRequest('identity/me', 'TEST ONLY')).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    expect(listener).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('numora:authorization-changed', listener);
  }
});

it('invalidates already-loaded data when a privileged request detects revoked access', async () => {
  const listener = vi.fn();
  window.addEventListener('numora:authorization-changed', listener);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'ACCOUNT_DISABLED' }), { status: 403 }),
      ),
  );
  try {
    await expect(apiRequest('admin/schools', 'TEST ONLY')).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('numora:authorization-changed', listener);
  }
});
