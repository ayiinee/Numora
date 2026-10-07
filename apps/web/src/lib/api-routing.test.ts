import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each([
  ['admin/content/uploads', 'http://localhost:3001/api/v1/admin/content/uploads'],
  ['identity/me', 'http://localhost:3001/api/v1/identity/me'],
  [
    'admin/content/generator/catalog',
    'http://localhost:4001/api/v1/admin/content/generator/catalog',
  ],
])('routes %s correctly while the isolated generator is active', async (path, expected) => {
  vi.stubEnv('NEXT_PUBLIC_GENERATOR_DEMO', 'true');
  vi.stubEnv('NEXT_PUBLIC_MAIN_API_URL', 'http://localhost:3001/api/v1');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4001/api/v1');
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await apiRequest(path, 'TEST_ONLY');
  expect(fetch.mock.calls[0]?.[0]).toBe(expected);
});
