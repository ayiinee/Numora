import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each([
  ['true', 'http://localhost:3001/api/v1/students/me/dashboard'],
  ['false', 'http://localhost:4001/api/v1/students/me/dashboard'],
])('routes the student dashboard with generator demo=%s', async (demo, expected) => {
  vi.stubEnv('NEXT_PUBLIC_GENERATOR_DEMO', demo);
  vi.stubEnv('NEXT_PUBLIC_MAIN_API_URL', 'http://localhost:3001/api/v1');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4001/api/v1');
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  vi.resetModules();
  const { learningApi } = await import('./api');
  await learningApi.dashboard('TEST_ONLY');
  expect(fetch.mock.calls[0]?.[0]).toBe(expected);
});
