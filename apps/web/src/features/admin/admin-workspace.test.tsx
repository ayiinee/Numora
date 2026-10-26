import { ApiProblem, type IdentityProfile } from '@/lib/api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminWorkspace, useAdminAccessError } from './admin-workspace';

const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown>, refresh: vi.fn() }));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: auth.state, refresh: auth.refresh }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/imports',
  useRouter: () => ({ replace: vi.fn() }),
}));
const load = vi.fn<() => Promise<string>>();
function Workspace() {
  const report = useAdminAccessError();
  const [text, setText] = useState('');
  useEffect(() => {
    void load().then(setText, report);
  }, [report]);
  return (
    <>
      <p>{text}</p>
      <input aria-label="Draf UI" defaultValue="" />
      <button onClick={() => report(new ApiProblem(403, 'FORBIDDEN', 'Akses dicabut.'))}>
        Revoke
      </button>
    </>
  );
}
function ready(role: IdentityProfile['adminRole'] = 'CONTENT_DATA_MODERATION') {
  auth.state = {
    status: 'ready',
    session: { access_token: 'TEST ONLY' },
    profile: {
      id: 'admin-a',
      role: 'ADMIN',
      status: 'ACTIVE',
      adminRole: role,
      capabilities: ['CONTENT_MANAGE'],
      displayName: 'TEST Admin',
    },
  };
}
const view = () => (
  <AdminWorkspace permission="content">
    <Workspace />
  </AdminWorkspace>
);
beforeEach(() => {
  vi.resetAllMocks();
  ready();
  load.mockResolvedValue('PRIVATE PREVIEW');
});
afterEach(cleanup);

it.each([null, 'OPERATIONS'] as const)('blocks assignment %s before mounting content', (role) => {
  ready(role);
  render(view());
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(load).not.toHaveBeenCalled();
});
it('does not restore a revoked workspace until a newly checked identity arrives', async () => {
  const result = render(view());
  await screen.findByText('PRIVATE PREVIEW');
  fireEvent.click(screen.getByText('Revoke'));
  expect(screen.queryByText('PRIVATE PREVIEW')).toBeNull();
  fireEvent.click(screen.getByText('Coba lagi'));
  expect(auth.refresh).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledOnce();
  ready();
  result.rerender(view());
  await screen.findByText('PRIVATE PREVIEW');
  expect(load).toHaveBeenCalledTimes(2);
});
it('discards a pending response and form state when the account changes', async () => {
  let finish!: (text: string) => void;
  load.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const result = render(view());
  ready();
  (auth.state.profile as IdentityProfile).id = 'admin-b';
  load.mockResolvedValue('ACCOUNT B');
  result.rerender(view());
  await screen.findByText('ACCOUNT B');
  await act(async () => finish('ACCOUNT A PRIVATE PREVIEW'));
  expect(screen.queryByText('ACCOUNT A PRIVATE PREVIEW')).toBeNull();
});
it('keeps an unsaved form when the same authorized account refreshes its access token', async () => {
  const result = render(view());
  await screen.findByText('PRIVATE PREVIEW');
  fireEvent.change(screen.getByLabelText('Draf UI'), { target: { value: 'UNSAVED' } });
  ready();
  auth.state.session = { access_token: 'REFRESHED TEST ONLY' };
  result.rerender(view());
  await screen.findByText('PRIVATE PREVIEW');
  expect((screen.getByLabelText('Draf UI') as HTMLInputElement).value).toBe('UNSAVED');
});
it('an old rejected request cannot revoke a different current account', async () => {
  let reject!: (error: Error) => void;
  load.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const result = render(view());
  ready();
  (auth.state.profile as IdentityProfile).id = 'admin-b';
  load.mockResolvedValue('ACCOUNT B');
  result.rerender(view());
  await screen.findByText('ACCOUNT B');
  await act(async () => reject(new ApiProblem(401, 'EXPIRED', 'OLD ACCOUNT')));
  await waitFor(() => expect(screen.getByText('ACCOUNT B')).toBeTruthy());
});
it('unmounts data when the same account loses its assignment or status', async () => {
  const result = render(view());
  await screen.findByText('PRIVATE PREVIEW');
  ready(null);
  result.rerender(view());
  expect(screen.queryByText('PRIVATE PREVIEW')).toBeNull();
  ready();
  (auth.state.profile as IdentityProfile).status = 'DISABLED';
  result.rerender(view());
  expect(load).toHaveBeenCalledOnce();
});
