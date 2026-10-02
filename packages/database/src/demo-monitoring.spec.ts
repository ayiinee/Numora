import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedDemoMonitoring } from './demo-monitoring.js';

afterEach(() => vi.unstubAllEnvs());

describe('Monitoring demo seed safety', () => {
  it('rejects non-local database URLs when called directly', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEMO_SEED', 'true');
    vi.stubEnv('DATABASE_URL', 'postgresql://demo:demo@example.com:5432/numora?sslmode=require');

    await expect(seedDemoMonitoring()).rejects.toThrow(
      'Monitoring demo profiles use placeholder Auth IDs and are restricted to a localhost database.',
    );
  });
});
