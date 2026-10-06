import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContentReviewScreen } from './content-review';
import { ReportDetailScreen } from './report-detail';
const mock = vi.hoisted(() => ({ api: vi.fn(), state: {} as Record<string, unknown> }));
vi.mock('@/features/onboarding/auth', () => ({ useAuth: () => ({ state: mock.state }) }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), apiRequest: mock.api }));
vi.mock('./admin-presentation', () => ({
  AdminFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminLoading: ({ message }: { message: string }) => <p>{message}</p>,
  AdminMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mock.state = {
    status: 'ready',
    profile: {
      id: 'admin',
      role: 'ADMIN',
      adminRole: 'CONTENT_DATA_MODERATION',
      capabilities: ['CONTENT_MANAGE'],
    },
    session: { access_token: 'TEST_ONLY' },
  };
});
afterEach(cleanup);
it('separates rich review from approved rubric publication and clears payload after revocation', async () => {
  mock.api.mockResolvedValue({
    id: 'v2',
    questionId: 'q',
    versionNumber: 2,
    status: 'DRAFT',
    revisedFromId: 'v1',
    sourceNamespace: 'TEST',
    reviewedByUserId: null,
    reviewedAt: null,
    payload: {
      type: 'CATEGORY',
      stem: { text: 'TEST category' },
      answer: { categoryByStatementId: { S1: 'TRUE' } },
    },
    readiness: {
      canReviewReady: true,
      contentBlockers: [],
      publicationBlockers: ['APPROVED_PGK_RUBRIC_REQUIRED'],
    },
    reviews: [],
  });
  const view = render(<ContentReviewScreen id="v2" />);
  await screen.findByText(/APPROVED_PGK_RUBRIC_REQUIRED/);
  fireEvent.change(screen.getByLabelText('Alasan review'), {
    target: { value: 'TEST validated key' },
  });
  mock.api.mockResolvedValueOnce({ id: 'v2' });
  fireEvent.submit(screen.getByLabelText('Alasan review').closest('form')!);
  await waitFor(() =>
    expect(mock.api).toHaveBeenCalledWith(
      'admin/content/versions/v2/review',
      'TEST_ONLY',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'READY',
          expectedStatus: 'DRAFT',
          reason: 'TEST validated key',
        }),
      }),
    ),
  );
  mock.state = {
    status: 'ready',
    profile: { id: 'admin', role: 'ADMIN', adminRole: 'OPERATIONS', capabilities: [] },
    session: { access_token: 'TEST_ONLY' },
  };
  view.rerender(<ContentReviewScreen id="v2" />);
  expect(screen.queryByText(/APPROVED_PGK_RUBRIC_REQUIRED/)).toBeNull();
});
it('opens the historical report target independently of loaded metadata or newer question versions', async () => {
  mock.api.mockResolvedValue({
    id: 'report',
    kind: 'QUESTION',
    category: 'ANSWER_KEY',
    details: 'TEST issue',
    status: 'OPEN',
    reportedAt: '2026-10-05T00:00:00Z',
    followUp: null,
    question: {
      id: 'old-version',
      versionNumber: 1,
      status: 'ARCHIVED',
      payload: { stem: { text: 'TEST original snapshot' } },
    },
    video: null,
    revisionQuestionVersionId: null,
  });
  render(<ReportDetailScreen kind="QUESTION" id="report" />);
  const link = await screen.findByRole('link', { name: /Buka versi yang dilaporkan/ });
  expect(link.getAttribute('href')).toBe('/admin/content/versions/old-version');
  expect(mock.api.mock.calls.map(([path]) => path)).toEqual(['admin/reports/QUESTION/report']);
  expect(screen.getByText(/TEST original snapshot/)).toBeTruthy();
});
