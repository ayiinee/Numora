import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiProblem, getAdminSchool, listAdminSchools } from '@/lib/api';
import { getAdminUser, listAdminUsers } from './operations-api';
import { OperationsPicker } from './operations-picker';
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  getAdminSchool: vi.fn(),
  listAdminSchools: vi.fn(),
}));
vi.mock('./operations-api', () => ({ getAdminUser: vi.fn(), listAdminUsers: vi.fn() }));
const school = {
  id: 'school-one',
  name: 'Sekolah Fixture',
  code: 'FIXTURE',
  status: 'ACTIVE' as const,
  address: null,
};
const teacher = {
  id: 'teacher-one',
  displayName: 'Guru Fixture',
  role: 'TEACHER' as const,
  status: 'ACTIVE' as const,
  createdAt: '2026-10-01T00:00:00Z',
  email: 'teacher@example.test',
  affiliation: null,
  teacherVerified: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    },
  });
  vi.mocked(listAdminSchools).mockResolvedValue({ items: [school], nextOffset: null });
  vi.mocked(getAdminSchool).mockResolvedValue(school);
  vi.mocked(listAdminUsers).mockResolvedValue({ items: [teacher], nextOffset: null, total: 1 });
  vi.mocked(getAdminUser).mockResolvedValue(teacher);
});
afterEach(cleanup);
it('loads school options only on demand, trims search and returns an identifier after selection', async () => {
  const change = vi.fn();
  render(
    <OperationsPicker
      kind="school"
      value=""
      token="TEST ONLY"
      onChange={change}
      onAccessError={vi.fn()}
    />,
  );
  expect(listAdminSchools).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Pilih sekolah' }));
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByRole('button', { name: school.name });
  fireEvent.change(within(dialog).getByLabelText('Cari sekolah'), {
    target: { value: ' Fixture ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cari' }));
  await waitFor(() =>
    expect(listAdminSchools).toHaveBeenLastCalledWith('TEST ONLY', {
      offset: 0,
      search: 'Fixture',
    }),
  );
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(await within(dialog).findByRole('button', { name: school.name }));
  expect(change).toHaveBeenCalledWith(school.id);
});
it('pins teacher lookup to the TEACHER role and preserves school scope', async () => {
  render(
    <OperationsPicker
      kind="teacher"
      value=""
      schoolId={school.id}
      token="TEST ONLY"
      onChange={vi.fn()}
      onAccessError={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pilih Guru' }));
  await screen.findByRole('button', { name: teacher.displayName });
  expect(listAdminUsers).toHaveBeenCalledWith('TEST ONLY', {
    offset: 0,
    search: '',
    role: 'TEACHER',
    schoolId: school.id,
  });
});
it('makes a failed saved selection name retryable', async () => {
  vi.mocked(getAdminSchool)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce(school);
  render(
    <OperationsPicker
      kind="school"
      value={school.id}
      token="TEST ONLY"
      onChange={vi.fn()}
      onAccessError={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Muat ulang nama sekolah' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Pilih sekolah' }).textContent).toContain(
      school.name,
    ),
  );
  expect(getAdminSchool).toHaveBeenCalledTimes(2);
});
it('reports an option-list access rejection to the enclosing workspace', async () => {
  const error = new ApiProblem(403, 'FORBIDDEN', 'Lookup ditolak.');
  const report = vi.fn();
  vi.mocked(listAdminSchools).mockRejectedValue(error);
  render(
    <OperationsPicker
      kind="school"
      value=""
      token="TEST ONLY"
      onChange={vi.fn()}
      onAccessError={report}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pilih sekolah' }));
  await screen.findByText('Lookup ditolak.');
  expect(report).toHaveBeenCalledWith(error);
});
it('discards a late label response when the selected identifier changes', async () => {
  let finish!: (value: typeof school) => void;
  vi.mocked(getAdminSchool)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ ...school, id: 'school-two', name: 'Sekolah Baru' });
  const props = { token: 'TEST ONLY', onChange: vi.fn(), onAccessError: vi.fn() };
  const view = render(<OperationsPicker kind="school" value={school.id} {...props} />);
  view.rerender(<OperationsPicker kind="school" value="school-two" {...props} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Pilih sekolah' }).textContent).toContain(
      'Sekolah Baru',
    ),
  );
  await act(async () => finish(school));
  expect(screen.getByRole('button', { name: 'Pilih sekolah' }).textContent).not.toContain(
    school.name,
  );
});
