import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRole, workerLayout } from './api-role';

afterEach(() => vi.unstubAllEnvs());
describe('API worker configuration', () => {
  it('keeps one PvP owner and divides one bounded connection budget', () => {
    const layout = workerLayout(3521, 2, 16);
    expect(layout).toEqual([
      { role: 'http', port: 3523, poolMax: 6 },
      { role: 'http', port: 3524, poolMax: 5 },
      { role: 'pvp', port: 3525, poolMax: 5 },
    ]);
    expect(layout.reduce((total, worker) => total + worker.poolMax, 0)).toBe(16);
    for (const args of [
      [3521, 2, 2],
      [65533, 2, 16],
      [3521, 0, 16],
      [3521, 9, 16],
    ])
      expect(() => workerLayout(args[0]!, args[1]!, args[2]!)).toThrow();
  });
  it('rejects malformed runtime roles', () => {
    vi.stubEnv('NUMORA_API_ROLE', 'all');
    expect(apiRole()).toBe('all');
    vi.stubEnv('NUMORA_API_ROLE', 'unrecognized');
    expect(() => apiRole()).toThrow();
  });
});
