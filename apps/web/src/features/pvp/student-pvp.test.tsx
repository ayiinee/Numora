import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentAccess } from '@/features/core-learning/student-session';
import { request } from '@/features/core-learning/api';
import { PvpMatchScreen, PvpScreen } from './student-pvp';
import type { PvpSnapshotDto } from '@/features/core-learning/generated-types';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  qr: vi.fn(),
  push: vi.fn(),
  connect: vi.fn(),
  io: vi.fn(),
  token: 'TEST-only-token',
  matchId: 'TEST-match',
  listeners: [] as Map<string, (event?: unknown) => void>[],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  usePathname: () => '/student/pvp',
  useParams: () => ({ matchId: mocks.matchId }),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({
    state: {
      status: 'ready',
      profile: {
        id: 'TEST-student',
        role: 'STUDENT',
        status: 'ACTIVE',
        displayName: 'TEST Student',
        studentAffiliation: 'MANDIRI',
      },
      session: { access_token: mocks.token },
    },
  }),
  destination: () => '/student',
}));
vi.mock('@/features/core-learning/api', () => ({
  request: vi.fn(),
  learningApi: {
    dashboard: async () => ({
      displayName: 'TEST Student',
      affiliation: 'MANDIRI',
      class: null,
      completedLevels: 0,
      availableLevels: 1,
      bestDrillScore: null,
    }),
  },
}));
vi.mock('socket.io-client', () => ({ io: mocks.io }));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token = 'TEST-only-token';
  mocks.matchId = 'TEST-match';
  mocks.listeners = [];
  mocks.qr.mockResolvedValue('TEST-QR');
  vi.mocked(request).mockImplementation(async (_token, path) =>
    path === '/pvp/availability'
      ? { available: true }
      : path.startsWith('/leaderboards/')
        ? { policyPending: true, entries: [], ownEntry: null }
        : { invites: [] },
  );
  mocks.io.mockImplementation(() => {
    const listeners = new Map<string, (event?: unknown) => void>();
    mocks.listeners.push(listeners);
    const socket = {
      connected: true,
      on: (event: string, callback: () => void) => {
        listeners.set(event, callback);
        if (event === 'connect') queueMicrotask(callback);
      },
      timeout: () => socket,
      emitWithAck: mocks.emit,
      emit: (
        _event: string,
        _body: unknown,
        callback: (error: null, ack: { payload: { ok: boolean } }) => void,
      ) => callback(null, { payload: { ok: true } }),
      connect: mocks.connect,
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
    };
    return socket;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('reuses a timed-out create request ID on explicit retry instead of creating a second room', async () => {
  mocks.emit
    .mockRejectedValueOnce(new Error('TEST lost acknowledgement'))
    .mockResolvedValueOnce({ payload: { ok: true, state: { matchId: 'TEST-match' } } });
  render(
    <StudentAccess>
      <PvpScreen />
    </StudentAccess>,
  );
  expect(document.querySelector('.app-mobile-header .materials-header')?.textContent).toBe(
    'PvP Duel',
  );
  const create = await screen.findByRole('button', { name: 'Buat room' });
  await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false));
  fireEvent.click(create);
  const retry = await screen.findByRole('button', { name: 'Periksa permintaan sebelumnya' });
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/student/pvp/TEST-match'));
  expect(mocks.emit).toHaveBeenCalledTimes(2);
  const first = mocks.emit.mock.calls[0]![1];
  const second = mocks.emit.mock.calls[1]![1];
  expect(second.requestId).toBe(first.requestId);
  expect(second.payload).toEqual(first.payload);
});
it('does not connect or expose create commands when server availability is false', async () => {
  vi.mocked(request).mockResolvedValue({ available: false });
  render(
    <StudentAccess>
      <PvpScreen />
    </StudentAccess>,
  );
  await screen.findByText('PvP belum tersedia');
  expect(mocks.io).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Buat room' })).toBeNull();
});

it('shows the server temporary-content notice without claiming calibrated question difficulty', async () => {
  const notice = 'Soal sementara; pilihan tingkat mengatur waktu 30, 45, dan 60 detik.';
  vi.mocked(request).mockImplementation(async (_token, path) =>
    path === '/pvp/availability'
      ? { available: true, dataMode: 'demo', contentNotice: notice }
      : path.startsWith('/leaderboards/')
        ? { policyPending: false, entries: [], ownEntry: null }
        : { invites: [] },
  );
  render(
    <StudentAccess>
      <PvpScreen />
    </StudentAccess>,
  );
  await screen.findByText(notice);
  expect(screen.getAllByText('Soal dari bank sementara')).toHaveLength(3);
  expect(screen.queryByText('Duel matematika tingkat mudah')).toBeNull();
  expect(screen.getByText('30 dtk / soal')).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Buat room' }).hasAttribute('disabled')).toBe(false),
  );
});

it('ignores an old connection acknowledgement and preserves its request ID across token renewal', async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.emit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const view = render(
    <StudentAccess>
      <PvpScreen />
    </StudentAccess>,
  );
  const create = await screen.findByRole('button', { name: 'Buat room' });
  await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false));
  fireEvent.click(create);
  await waitFor(() => expect(mocks.emit).toHaveBeenCalledOnce());
  const first = mocks.emit.mock.calls[0]![1];
  mocks.token = 'TEST-renewed-token';
  view.rerender(
    <StudentAccess>
      <PvpScreen />
    </StudentAccess>,
  );
  await waitFor(() => expect(mocks.io).toHaveBeenCalledTimes(2));
  await act(async () => {
    resolveOld({ payload: { ok: true, state: { matchId: 'OLD-match' } } });
  });
  expect(mocks.push).not.toHaveBeenCalled();
  mocks.emit.mockResolvedValueOnce({ payload: { ok: true, state: { matchId: 'CURRENT-match' } } });
  const retry = await screen.findByRole('button', { name: 'Periksa permintaan sebelumnya' });
  await waitFor(() => expect(retry.hasAttribute('disabled')).toBe(false));
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/student/pvp/CURRENT-match'));
  expect(mocks.emit.mock.calls[1]![1].requestId).toBe(first.requestId);
});

it('shows the current match after a route change and ignores snapshots from other matches', async () => {
  const snapshot = (matchId: string, roomCode: string): PvpSnapshotDto => ({
    matchId,
    roomCode,
    creatorStudentId: 'TEST-student',
    difficulty: 'easy',
    status: 'WAITING',
    serverTime: new Date().toISOString(),
    isDemo: true,
    recordEligible: false,
    endReason: null,
    players: [],
    question: null,
  });
  vi.mocked(request).mockImplementation(async (_token, path) => {
    if (path === '/pvp/availability') return { available: true };
    if (path.startsWith('/pvp/matches/')) return snapshot(path.split('/').at(-1)!, 'REST-ROOM');
    return { classmates: [], invites: [] };
  });
  const view = render(
    <StudentAccess>
      <PvpMatchScreen />
    </StudentAccess>,
  );
  await screen.findByText('Room REST-ROOM');
  await waitFor(() => expect(mocks.listeners).toHaveLength(1));
  act(() =>
    mocks.listeners[0]!.get('room:state')!({ payload: snapshot('TEST-match', 'OLD-ROOM') }),
  );
  await screen.findByText('Room OLD-ROOM');
  mocks.matchId = 'NEW-match';
  view.rerender(
    <StudentAccess>
      <PvpMatchScreen />
    </StudentAccess>,
  );
  await waitFor(() => expect(mocks.listeners).toHaveLength(2));
  await screen.findByText('Room REST-ROOM');
  expect(screen.queryByText('Room OLD-ROOM')).toBeNull();
  act(() => mocks.listeners[1]!.get('room:state')!({ payload: snapshot('NEW-match', 'NEW-ROOM') }));
  await screen.findByText('Room NEW-ROOM');
  act(() =>
    mocks.listeners[1]!.get('room:state')!({ payload: snapshot('TEST-match', 'FOREIGN-ROOM') }),
  );
  expect(screen.getByText('Room NEW-ROOM')).toBeTruthy();
  expect(screen.queryByText('Room FOREIGN-ROOM')).toBeNull();
});

function matchSnapshot(status: PvpSnapshotDto['status'] = 'RUNNING'): PvpSnapshotDto {
  return {
    matchId: mocks.matchId,
    roomCode: 'NMR842ABC123',
    creatorStudentId: 'TEST-student',
    difficulty: 'medium',
    status,
    serverTime: new Date().toISOString(),
    isDemo: true,
    recordEligible: false,
    endReason: null,
    players: [
      {
        studentId: 'TEST-student',
        displayName: 'TEST Student',
        slot: 1,
        ready: false,
        connectionStatus: 'CONNECTED',
        reconnectDeadlineAt: null,
        points: 0,
        result: null,
      },
    ],
    question:
      status === 'RUNNING'
        ? {
            id: 'TEST-question',
            order: 4,
            stem: 'TEST: 2 + 2?',
            options: [
              { id: 'option-a', text: '4' },
              { id: 'option-b', text: '5' },
            ],
            deadlineAt: new Date(Date.now() + 45_000).toISOString(),
            durationSeconds: 45,
            answered: false,
            selectedOptionId: null,
          }
        : null,
  };
}
function serveMatch(snapshot: PvpSnapshotDto) {
  vi.mocked(request).mockImplementation(async (_token, path) =>
    path === '/pvp/availability'
      ? { available: true }
      : path.startsWith('/pvp/matches/')
        ? snapshot
        : { classmates: [], invites: [] },
  );
}
it('keeps selection separate from server lock and retries uncertain answers with the same identity', async () => {
  const snapshot = matchSnapshot();
  serveMatch(snapshot);
  const locked = {
    ...snapshot,
    question: { ...snapshot.question!, answered: true, selectedOptionId: 'option-a' },
  };
  mocks.emit
    .mockRejectedValueOnce(new Error('TEST lost ACK'))
    .mockResolvedValueOnce({ payload: { ok: true, state: locked } });
  render(
    <StudentAccess>
      <PvpMatchScreen />
    </StudentAccess>,
  );
  const radio = await screen.findByRole('radio', { name: /A\s*\.\s*4/ });
  await waitFor(() => expect(radio.matches(':disabled')).toBe(false));
  fireEvent.click(radio);
  expect(screen.getByText('Jawaban dipilih • Belum dikirim')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Kunci jawaban' }));
  const retry = await screen.findByRole('button', { name: 'Periksa permintaan sebelumnya' });
  expect(screen.queryByText('Jawaban Kamu • Terkunci')).toBeNull();
  expect(radio.matches(':disabled')).toBe(true);
  fireEvent.click(retry);
  await screen.findByText('Jawaban Kamu • Terkunci');
  expect(mocks.emit).toHaveBeenCalledTimes(2);
  expect(mocks.emit.mock.calls[1]![1].requestId).toBe(mocks.emit.mock.calls[0]![1].requestId);
  expect(mocks.emit.mock.calls[0]![1].payload).toEqual({
    matchId: mocks.matchId,
    questionId: 'TEST-question',
    optionId: 'option-a',
  });
  expect(screen.getByRole('radio', { name: /B\s*\.\s*5/ }).matches(':disabled')).toBe(true);
});
it('keeps ready waiting on the server and allows Mandiri to share without classmates', async () => {
  const snapshot = matchSnapshot('WAITING');
  serveMatch(snapshot);
  mocks.emit.mockResolvedValue({
    payload: {
      ok: true,
      state: {
        ...snapshot,
        players: snapshot.players.map((player) => ({ ...player, ready: true })),
      },
    },
  });
  render(
    <StudentAccess>
      <PvpMatchScreen />
    </StudentAccess>,
  );
  const ready = await screen.findByRole('button', { name: 'Saya siap' });
  await waitFor(() => expect(ready.hasAttribute('disabled')).toBe(false));
  await screen.findByText('Belum ada teman sekelas. Kamu tetap dapat membagikan link room.');
  fireEvent.click(ready);
  await screen.findByRole('button', { name: 'Menunggu pemain lain' });
  expect(screen.queryByRole('radio')).toBeNull();
  expect(mocks.emit.mock.calls[0]![1].payload).toEqual({ matchId: mocks.matchId });
  expect(screen.getByRole('button', { name: 'Bagikan Link Duel' })).toBeTruthy();
});
it('locks expired round controls and waits for the server instead of advancing or scoring locally', async () => {
  const snapshot = matchSnapshot();
  snapshot.question!.deadlineAt = new Date(Date.now() - 1000).toISOString();
  serveMatch(snapshot);
  render(
    <StudentAccess>
      <PvpMatchScreen />
    </StudentAccess>,
  );
  await screen.findByRole('timer', { name: 'Sisa waktu' });
  expect(screen.getByRole('timer', { name: 'Sisa waktu' }).textContent).toBe('0');
  expect(screen.getByRole('radio', { name: /A\s*\.\s*4/ }).matches(':disabled')).toBe(true);
  expect(mocks.emit).not.toHaveBeenCalled();
});
it.each(['CANCELLED', 'FINISHED'] as const)(
  'keeps %s outcomes out of ranking when the server marks them ineligible',
  async (status) => {
    const snapshot = {
      ...matchSnapshot(status),
      endReason: status === 'FINISHED' ? 'FORFEIT' : 'SERVICE_INTERRUPTED',
    };
    serveMatch(snapshot);
    render(
      <StudentAccess>
        <PvpMatchScreen />
      </StudentAccess>,
    );
    await screen.findByText('Pertandingan ini tidak berkontribusi pada leaderboard.');
    expect(screen.queryByRole('button', { name: 'Saya siap' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen
        .getAllByRole('link', { name: 'Kembali ke PvP' })
        .every((link) => link.getAttribute('href') === '/student/pvp'),
    ).toBe(true);
    expect(screen.queryByText('+120 XP')).toBeNull();
  },
);

it('replaces failed QR loading with a truthful code/link fallback', async () => {
  mocks.qr.mockRejectedValueOnce(new Error('TEST QR failure'));
  serveMatch(matchSnapshot('WAITING'));
  render(
    <StudentAccess>
      <PvpMatchScreen />
    </StudentAccess>,
  );
  await screen.findByText('QR belum tersedia. Gunakan kode atau link room.');
  expect(screen.queryByText('Menyiapkan QR…')).toBeNull();
  expect(screen.queryByRole('img', { name: 'QR link gabung room' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Salin' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /student\/pvp\?room=/ }).getAttribute('href')).toContain(
    'NMR842ABC123',
  );
});
