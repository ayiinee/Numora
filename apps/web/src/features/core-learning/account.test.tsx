import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAccess } from './student-session';
import { FeedbackScreen } from './feedback-inbox';
import { ProfileScreen } from './profile';
import { FeedbackOverview } from './feedback-overview';
import { learningApi, request, LearningApiError } from './api';
import { joinClass } from '@/lib/api';
import type { FeedbackDto } from '@/lib/generated-api-types';

const auth = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  refresh: vi.fn(),
  logout: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/student/profile',
  useRouter: () => ({ replace: auth.replace }),
}));
vi.mock('@/features/onboarding/auth', () => ({ useAuth: () => auth, destination: () => '/' }));
vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  request: vi.fn(),
  learningApi: { dashboard: vi.fn(), currentTryout: vi.fn() },
}));
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), joinClass: vi.fn() }));
const profile = {
  id: 'student-a',
  role: 'STUDENT',
  status: 'ACTIVE',
  displayName: 'Kirino S.',
  email: 'kirino@example.test',
  studentAffiliation: 'MANDIRI',
  teacherVerified: null,
};
const note: FeedbackDto = {
  id: 'note-a',
  classId: 'class-a',
  studentId: 'student-a',
  teacherName: 'Bu Ratna',
  body: 'Catatan siswa A. <script>alert(1)</script>',
  sentAt: '2026-10-01T02:30:00Z',
  readAt: null,
};
const readAt = '2026-10-04T02:00:00Z';
let notes: FeedbackDto[];
beforeEach(() => {
  vi.resetAllMocks();
  notes = [{ ...note }];
  auth.state = { status: 'ready', profile, session: { access_token: 'token-a' } };
  vi.mocked(learningApi.dashboard).mockResolvedValue({
    displayName: 'Kirino S.',
    totalXp: 0,
    affiliation: 'MANDIRI',
    class: null,
    completedLevels: 0,
    availableLevels: 20,
    latestDrillScore: 0,
    bestDrillScore: 0,
    activities: [],
    activeDrill: null,
    features: {
      drill: true,
      tryout: true,
      pvp: false,
      pretest: false,
      classLeaderboard: false,
      pendingPolicies: [],
    },
  });
  vi.mocked(learningApi.currentTryout).mockResolvedValue({
    state: 'waitingIrt',
    title: 'Tryout Mingguan #03',
  });
  vi.mocked(request).mockImplementation(async (_token, path) => {
    if (path.endsWith('/summary'))
      return { unreadCount: notes.filter((n) => !n.readAt).length, latest: notes };
    if (path.endsWith('/read')) {
      notes = notes.map((n) => ({ ...n, readAt }));
      return { id: note.id, readAt };
    }
    return { items: notes, nextOffset: null };
  });
});
afterEach(cleanup);
const mount = (node: React.ReactNode) => render(<StudentAccess>{node}</StudentAccess>);
const readCalls = () => vi.mocked(request).mock.calls.filter(([, path]) => path.endsWith('/read'));

describe('Student account and feedback', () => {
  it('loads previews and inbox without marking anything read and renders body as text', async () => {
    mount(
      <>
        <FeedbackOverview token="token-a" />
        <FeedbackScreen />
      </>,
    );
    await screen.findByRole('button', { name: 'Tandai Dibaca' });
    expect(readCalls()).toHaveLength(0);
    expect(document.querySelector('blockquote script')).toBeNull();
    expect(screen.getAllByText(note.body).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Inbox' }).getAttribute('href')).toBe(
      '/student/feedback',
    );
  });
  it('updates read state and preview summary only after the matching server ACK', async () => {
    let resolveRead!: (value: unknown) => void;
    const initial = vi.mocked(request).getMockImplementation()!;
    vi.mocked(request).mockImplementation((token, path, init) =>
      path.endsWith('/read')
        ? new Promise((resolve) => {
            resolveRead = resolve;
          })
        : initial(token, path, init),
    );
    mount(<FeedbackScreen />);
    const button = await screen.findByRole('button', { name: 'Tandai Dibaca' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(readCalls()).toHaveLength(1));
    expect(screen.queryByText('Sudah Dibaca')).toBeNull();
    expect(readCalls()[0]).toEqual([
      'token-a',
      '/students/me/feedback/note-a/read',
      { method: 'POST' },
    ]);
    notes = [{ ...note, readAt }];
    resolveRead({ id: note.id, readAt });
    await screen.findByText('Sudah Dibaca');
    await screen.findByRole('button', { name: 'Baru & Belum Dibaca (0)' });
  });
  it.each(['failure', 'wrong-id'])(
    'keeps unread state after %s and supports explicit retry',
    async (kind) => {
      const initial = vi.mocked(request).getMockImplementation()!;
      let fail = true;
      vi.mocked(request).mockImplementation(async (token, path, init) => {
        if (path.endsWith('/read') && fail) {
          if (kind === 'failure') throw new LearningApiError('Belum terkirim.', 503);
          return { id: 'other-note', readAt };
        }
        return initial(token, path, init);
      });
      mount(<FeedbackScreen />);
      fireEvent.click(await screen.findByRole('button', { name: 'Tandai Dibaca' }));
      const retry = await screen.findByRole('button', { name: 'Coba tandai dibaca lagi' });
      expect(screen.queryByText('Sudah Dibaca')).toBeNull();
      fail = false;
      fireEvent.click(retry);
      await screen.findByText('Sudah Dibaca');
      expect(readCalls()).toHaveLength(2);
    },
  );
  it('preserves previous pages on pagination error and uses server offset when retried', async () => {
    let failed = true;
    const next = { ...note, id: 'note-b', body: 'Halaman kedua', readAt };
    vi.mocked(request).mockImplementation(async (_token, path) => {
      if (path.endsWith('/summary')) return { unreadCount: 1, latest: [note] };
      if (path.includes('offset=20')) {
        if (failed) throw new LearningApiError('Halaman kedua gagal.', 403);
        return { items: [note, next], nextOffset: null };
      }
      return { items: [note], nextOffset: 20 };
    });
    mount(<FeedbackScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Muat lainnya' }));
    const retry = await screen.findByRole('button', { name: 'Coba muat catatan lagi' });
    expect(screen.getByText(note.body)).toBeTruthy();
    failed = false;
    fireEvent.click(retry);
    await screen.findByText('Halaman kedua');
    expect(screen.getAllByRole('heading', { name: 'Bu Ratna' })).toHaveLength(2);
    expect(request).toHaveBeenCalledWith('token-a', '/students/me/feedback?limit=20&offset=20');
  });
  it('filters only loaded unread messages, retains load-more, and restores focus after marking', async () => {
    const initial = vi.mocked(request).getMockImplementation()!;
    vi.mocked(request).mockImplementation(async (token, path, init) =>
      path.includes('?') ? { items: notes, nextOffset: 20 } : initial(token, path, init),
    );
    mount(<FeedbackScreen />);
    const filter = await screen.findByRole('button', { name: 'Baru & Belum Dibaca (1)' });
    fireEvent.click(filter);
    expect(screen.getByText(/Filter menampilkan catatan yang sudah dimuat/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Tandai Dibaca' }));
    await screen.findByRole('heading', {
      name: 'Tidak ada catatan belum dibaca pada halaman yang dimuat',
    });
    expect(screen.getByRole('button', { name: 'Muat lainnya' })).toBeTruthy();
    expect(document.activeElement).toBe(filter);
  });
  it('clears inbox data when the Student account changes', async () => {
    const view = mount(<FeedbackScreen />);
    await screen.findByText(note.body);
    auth.state = {
      status: 'ready',
      profile: { ...profile, id: 'student-b' },
      session: { access_token: 'token-b' },
    };
    notes = [{ ...note, id: 'note-b', studentId: 'student-b', body: 'Catatan siswa B' }];
    view.rerender(
      <StudentAccess>
        <FeedbackScreen />
      </StudentAccess>,
    );
    await screen.findByText('Catatan siswa B');
    expect(screen.queryByText(note.body)).toBeNull();
    expect(request).toHaveBeenCalledWith('token-b', '/students/me/feedback?limit=20&offset=0');
  });
  it('does not request feedback while signed out', async () => {
    auth.state = { status: 'signed_out' };
    mount(<FeedbackScreen />);
    await waitFor(() => expect(auth.replace).toHaveBeenCalledWith('/'));
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps zero score, pending IRT and optional Join Class on the profile', async () => {
    mount(<ProfileScreen />);
    await screen.findByText('Menunggu hasil IRT');
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Skor IRT:/)).toBeNull();
    expect(screen.getByLabelText(/Kode kelas/)).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: /Feedback dari Guru/ })
        .every((link) => link.getAttribute('href') === '/student/feedback'),
    ).toBe(true);
  });
  it('retains invalid join input and never changes affiliation before identity refresh', async () => {
    vi.mocked(joinClass).mockRejectedValue(new Error('Kode tidak valid.'));
    mount(<ProfileScreen />);
    fireEvent.change(screen.getByLabelText(/Kode kelas/), { target: { value: 'BAD999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
    await screen.findByText('Kode tidak valid.');
    expect((screen.getByLabelText(/Kode kelas/) as HTMLInputElement).value).toBe('BAD999');
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(screen.getByText('BELAJAR MANDIRI')).toBeTruthy();
  });
  it('keeps the profile and retry available after logout fails', async () => {
    auth.logout.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    mount(<ProfileScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Keluar Akun Google' }));
    await screen.findByText('Belum dapat keluar. Coba lagi.');
    expect(auth.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keluar Akun Google' }));
    await waitFor(() => expect(auth.replace).toHaveBeenCalledWith('/'));
  });
});
