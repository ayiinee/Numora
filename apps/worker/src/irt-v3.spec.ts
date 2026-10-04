import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  pending: vi.fn(),
  delivery: vi.fn(),
  reconcile: vi.fn(),
  add: vi.fn(),
}));
vi.mock('@tka/database', () => ({ getDatabase: () => ({ client: {} }) }));
vi.mock('@tka/irt-orchestration', () => ({
  pendingComputeNotifications: mocks.pending,
  recordNotificationDelivery: mocks.delivery,
  reconcileTryoutArtifacts: mocks.reconcile,
}));
import { pollIrtV3 } from './irt-v3.js';
const original = process.env.IRT_V3_ENABLED;
describe('IRT notification failures and opt-in', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.IRT_V3_ENABLED = 'true';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.IRT_V3_ENABLED;
    else process.env.IRT_V3_ENABLED = original;
  });
  it('does no queue/database work while disabled', async () => {
    process.env.IRT_V3_ENABLED = 'false';
    await expect(pollIrtV3({ add: mocks.add })).resolves.toEqual({
      notified: 0,
      adopted: 0,
      failed: 0,
    });
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it('retains the quota error even when PostgreSQL delivery bookkeeping is unavailable', async () => {
    mocks.pending.mockResolvedValue([
      {
        contractVersion: 3,
        requestId: '00000000-0000-4000-8000-000000000001',
        inputDigest: 'a'.repeat(64),
        dispatchGeneration: 1,
      },
    ]);
    const quota = new Error('ERR max requests limit exceeded');
    mocks.add.mockRejectedValue(quota);
    mocks.delivery.mockRejectedValue(new Error('DB unavailable'));
    await expect(pollIrtV3({ add: mocks.add })).rejects.toBe(quota);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
