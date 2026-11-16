import { afterEach, expect, it, vi } from 'vitest';
import { PvpService } from './pvp.service';
import type { PvpEngineService } from './pvp-engine.service';
import type { IdentityService } from '../identity/identity.service';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it('uses the local owner in the default runtime', async () => {
  vi.stubEnv('NUMORA_API_ROLE', 'all');
  const availability = vi.fn().mockResolvedValue({ available: true });
  const service = new PvpService(
    {} as IdentityService,
    { availability } as unknown as PvpEngineService,
  );
  expect(await service.dashboardAvailable('Bearer TEST_ONLY')).toBe(true);
  expect(availability).toHaveBeenCalledOnce();
});
it('forwards fresh authenticated availability only to loopback and fails closed on malformed/outage responses', async () => {
  vi.stubEnv('NUMORA_API_ROLE', 'http');
  vi.stubEnv('NUMORA_PVP_INTERNAL_ORIGIN', 'http://127.0.0.1:3525');
  const engine = { availability: vi.fn() };
  const service = new PvpService({} as IdentityService, engine as unknown as PvpEngineService);
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('{"available":true}'))
    .mockResolvedValueOnce(new Response('{"available":"true"}'))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockRejectedValueOnce(new Error('TEST_ONLY disconnected'));
  expect(await service.dashboardAvailable('Bearer TEST_ONLY')).toBe(true);
  expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:3525/api/v1/pvp/availability');
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer TEST_ONLY' });
  expect(await service.dashboardAvailable('Bearer TEST_ONLY')).toBe(false);
  expect(await service.dashboardAvailable('Bearer TEST_ONLY')).toBe(false);
  expect(await service.dashboardAvailable('Bearer TEST_ONLY')).toBe(false);
  vi.stubEnv('NUMORA_PVP_INTERNAL_ORIGIN', 'https://example.com');
  expect(await service.dashboardAvailable('Bearer TEST_ONLY')).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(engine.availability).not.toHaveBeenCalled();
});
