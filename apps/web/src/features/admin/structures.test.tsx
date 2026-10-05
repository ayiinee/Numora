import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminStructuresScreen } from './structures';
const mocks = vi.hoisted(() => ({ api: vi.fn(), state: {} as Record<string, unknown> }));
vi.mock('@/features/onboarding/auth', () => ({ useAuth: () => ({ state: mocks.state }) }));
vi.mock('@/lib/api', () => ({ apiRequest: mocks.api }));
vi.mock('./admin-presentation', () => ({
  AdminFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminLoading: ({ message }: { message: string }) => <p>{message}</p>,
  AdminMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = {
    status: 'ready',
    profile: {
      id: 'content',
      role: 'ADMIN',
      adminRole: 'CONTENT_DATA_MODERATION',
      capabilities: ['OPERATIONS_LIMITED_READ'],
    },
    session: { access_token: 'TEST ONLY' },
  };
});
afterEach(cleanup);
it('Content navigates school counts to limited classes without requesting individual endpoints', async () => {
  mocks.api.mockImplementation(async (path: string) =>
    path.includes('/schools')
      ? {
          items: [
            {
              id: 'school',
              name: 'School',
              code: 'S',
              status: 'ACTIVE',
              classCount: 1,
              activeTeacherCount: 0,
              studentCount: 5,
            },
          ],
          nextOffset: null,
        }
      : {
          items: [
            {
              id: 'class',
              name: 'Class',
              schoolId: 'school',
              schoolName: 'School',
              studentCount: 5,
              teacherActive: false,
              createdAt: '2026-10-05T00:00:00Z',
              archivedAt: null,
            },
          ],
          nextOffset: null,
        },
  );
  render(<AdminStructuresScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Lihat kelas sekolah' }));
  await screen.findByText(/Tanpa Guru aktif/);
  expect(mocks.api.mock.calls.every(([path]) => String(path).startsWith('admin/structures/'))).toBe(
    true,
  );
  expect(mocks.api.mock.calls[1]![0]).toContain('schoolId=school');
});
it('clears limited loaded data after capability revocation', async () => {
  mocks.api.mockResolvedValue({
    items: [
      {
        id: 'school',
        name: 'Restricted school',
        code: 'S',
        classCount: 1,
        activeTeacherCount: 0,
        studentCount: 5,
      },
    ],
    nextOffset: null,
  });
  const view = render(<AdminStructuresScreen />);
  await screen.findByText('Restricted school');
  mocks.state = { status: 'ready', profile: { role: 'ADMIN', capabilities: [] } };
  view.rerender(<AdminStructuresScreen />);
  await waitFor(() => expect(screen.queryByText('Restricted school')).toBeNull());
});
