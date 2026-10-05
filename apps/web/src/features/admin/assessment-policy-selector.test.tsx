import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api';
import { AssessmentPolicySelector } from './assessment-policy-selector';
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: { status: 'ready', profile: { id: 'TEST', adminRole: 'CONTENT_DATA_MODERATION' } },
  }),
}));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
function mount() {
  render(
    <form>
      <AssessmentPolicySelector token="TEST" type="DRILL" />
      <button>Submit</button>
    </form>,
  );
}
it('blocks native form validity when no approved policy exists and exposes the academic blocker', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [] });
  mount();
  await screen.findByText(/Belum ada policy published/);
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  expect(select.required).toBe(true);
  expect(select.checkValidity()).toBe(false);
});
it('filters by assessment type and displays durable approval evidence', async () => {
  vi.mocked(apiRequest).mockResolvedValue({
    items: [
      {
        id: 'approved',
        code: 'NUMORA_DRILL_V06',
        version: 2,
        assessmentType: 'DRILL',
        approvedAt: '2026-10-05T00:00:00Z',
        approvalReference: 'TEST approved evidence',
      },
      {
        id: 'wrong-type',
        code: 'NUMORA_TRYOUT_V06',
        version: 1,
        assessmentType: 'TRYOUT',
        approvedAt: '2026-10-05T00:00:00Z',
        approvalReference: 'TEST',
      },
    ],
  });
  mount();
  await screen.findByText(/TEST approved evidence/);
  expect(screen.queryByRole('option', { name: /TRYOUT/ })).toBeNull();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'approved' } });
  expect((screen.getByRole('combobox') as HTMLSelectElement).checkValidity()).toBe(true);
});
it('keeps a failed loader retryable while submission remains blocked', async () => {
  vi.mocked(apiRequest)
    .mockRejectedValueOnce(new Error('TEST outage'))
    .mockResolvedValueOnce({ items: [] });
  mount();
  await screen.findByRole('alert');
  expect((screen.getByRole('combobox') as HTMLSelectElement).checkValidity()).toBe(false);
  fireEvent.click(screen.getByText('Coba lagi'));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
});
