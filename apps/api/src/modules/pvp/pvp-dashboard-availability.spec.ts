import { afterEach, expect, it, vi } from 'vitest';
import { PvpService } from './pvp.service';
import { PvpEngineService } from './pvp-engine.service';
import type { IdentityService } from '../identity/identity.service';
import type { PvpPolicy } from './pvp.policy';
import { pvpOwnerReady } from '../../runtime/pvp-owner-readiness';
vi.mock('../../runtime/pvp-owner-readiness', () => ({ pvpOwnerReady: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('keeps default availability local and evaluates fresh domain eligibility on every dashboard read', async () => {
  vi.stubEnv('NUMORA_API_ROLE', 'all');
  const availability = vi
    .fn()
    .mockResolvedValueOnce({ available: true })
    .mockResolvedValueOnce({ available: false });
  const service = new PvpService(
    {} as IdentityService,
    { availability } as unknown as PvpEngineService,
  );
  expect(await service.dashboardAvailable()).toBe(true);
  expect(await service.dashboardAvailable()).toBe(false);
  expect(pvpOwnerReady).not.toHaveBeenCalled();
  expect(availability).toHaveBeenCalledTimes(2);
});
it('checks coordinator liveness and still applies fresh domain eligibility in the HTTP worker', async () => {
  vi.stubEnv('NUMORA_API_ROLE', 'http');
  vi.mocked(pvpOwnerReady)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const availability = vi
    .fn()
    .mockResolvedValueOnce({ available: true })
    .mockResolvedValueOnce({ available: false })
    .mockResolvedValueOnce({ available: false });
  const service = new PvpService(
    {} as IdentityService,
    { availability } as unknown as PvpEngineService,
  );
  expect(await service.dashboardAvailable()).toBe(true);
  expect(await service.dashboardAvailable()).toBe(false);
  expect(await service.dashboardAvailable()).toBe(false);
  expect(availability.mock.calls).toEqual([
    [undefined, true],
    [undefined, false],
    [undefined, true],
  ]);
});
it('cannot override authoritative owner readiness or the emergency room switch', async () => {
  vi.stubEnv('NUMORA_API_ROLE', 'pvp');
  vi.stubEnv('PVP_CONTENT_MODE', 'strict');
  vi.stubEnv('PVP_NEW_MATCHES_ENABLED', 'true');
  const engine = new PvpEngineService({ mode: 'demo' } as PvpPolicy);
  expect(await engine.availability(undefined, true)).toMatchObject({
    available: false,
    reasonCode: 'PVP_SCHEDULER_UNAVAILABLE',
  });
  vi.stubEnv('NUMORA_API_ROLE', 'http');
  vi.stubEnv('PVP_NEW_MATCHES_ENABLED', 'false');
  expect(await engine.availability(undefined, true)).toMatchObject({
    available: false,
    reasonCode: 'PVP_NEW_MATCHES_DISABLED',
  });
});
