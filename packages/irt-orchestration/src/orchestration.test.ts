import { describe, expect, it, vi } from 'vitest';
import { prepareTryoutAnalysis } from './orchestration.js';

describe('production Tryout adapter boundary', () => {
  it('requires delivery binding instead of legacy single-package prepare', async () => {
    vi.stubEnv('IRT_V3_ENABLED', 'true');
    vi.stubEnv('NUMORA_IRT_MODE', 'PRODUCTION');
    try {
      await expect(
        prepareTryoutAnalysis(null as never, 'actor', 'idempotency', {
          contextId: '00000000-0000-4000-8000-000000000001',
          configurationPins: [
            {
              approvalId: '00000000-0000-4000-8000-000000000002',
              digest: 'a'.repeat(64),
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'IRT_PRODUCTION_DELIVERY_BINDING_REQUIRED' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
