import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MatchOutcome, WaitingRoom } from './pvp-presentation';
import type { PvpSnapshotDto } from '@/features/core-learning/generated-types';

afterEach(cleanup);

function snapshot(result: string | null = null): PvpSnapshotDto {
  return {
    matchId: 'TEST-match',
    roomCode: 'TEST842AB123',
    creatorStudentId: 'TEST-self',
    difficulty: 'easy',
    status: result ? 'FINISHED' : 'WAITING',
    serverTime: '2026-11-10T00:00:00Z',
    isDemo: true,
    recordEligible: true,
    endReason: result ? 'COMPLETED' : null,
    question: null,
    players: [
      {
        studentId: 'TEST-opponent',
        displayName: 'Lawan',
        slot: 1,
        ready: false,
        connectionStatus: 'CONNECTED',
        reconnectDeadlineAt: null,
        points: 671,
        result: result === 'DRAW' ? 'DRAW' : 'WIN',
      },
      {
        studentId: 'TEST-self',
        displayName: 'Siswa',
        slot: 2,
        ready: false,
        connectionStatus: 'CONNECTED',
        reconnectDeadlineAt: null,
        points: 559,
        result,
      },
    ],
  };
}

it.each([
  ['WIN', 'Kamu menang!'],
  ['LOSS', 'Kamu kalah kali ini'],
  ['DRAW', 'Duel berakhir seri'],
  ['FORFEIT', 'Kamu kalah kali ini'],
])('shows the server result %s explicitly for the current player', (result, title) => {
  render(<MatchOutcome snapshot={snapshot(result)} selfId="TEST-self" />);
  expect(screen.getByRole('heading', { name: title })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Poin & Rekor' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Main lagi' }).getAttribute('href')).toBe('/student/pvp');
  if (result === 'LOSS' || result === 'FORFEIT')
    expect(screen.getByText('Kalah', { exact: true })).toBeTruthy();
});

it('keeps cancellation and an unknown result distinct from a loss', () => {
  const state = snapshot();
  const view = render(
    <MatchOutcome
      snapshot={{ ...state, status: 'CANCELLED', endReason: 'ROOM_EXPIRED', recordEligible: false }}
      selfId="TEST-self"
    />,
  );
  expect(screen.getByRole('heading', { name: 'Waktu tunggu habis' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Kamu kalah kali ini' })).toBeNull();
  view.rerender(<MatchOutcome snapshot={{ ...state, status: 'FINISHED' }} selfId="TEST-self" />);
  expect(screen.getByRole('heading', { name: 'Duel selesai' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Kamu kalah kali ini' })).toBeNull();
});

it('groups the timer, both players and ready action while awaiting server acknowledgement', () => {
  const state = snapshot();
  const onReady = vi.fn();
  const onStart = vi.fn();
  const props = {
    snapshot: state,
    selfId: 'TEST-self',
    qr: 'TEST-qr',
    qrError: false,
    link: '/student/pvp?room=TEST842AB123',
    disabled: false,
    onReady,
    onStart,
    onCopy: vi.fn(),
    onShare: vi.fn(),
    reconnectRemaining: {},
    roomRemaining: 165,
  };
  const view = render(<WaitingRoom {...props} />);
  const panel = screen.getByLabelText('Kesiapan duel');
  expect(within(panel).getByRole('timer', { name: 'Sisa waktu room' }).textContent).toBe('02:45');
  expect(within(panel).getByRole('heading', { name: 'Lawan sudah bergabung' })).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Saya siap' }));
  expect(onReady).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Kamu sudah siap' })).toBeNull();
  state.players[1]!.ready = true;
  view.rerender(<WaitingRoom {...props} snapshot={{ ...state }} />);
  expect(
    (screen.getByRole('button', { name: 'Kamu sudah siap' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByRole('status').textContent).toBe('Menunggu Lawan menekan Siap.');
  const start = screen.getByRole('button', { name: 'Mulai duel' }) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  state.players[0]!.ready = true;
  view.rerender(<WaitingRoom {...props} snapshot={{ ...state }} />);
  const hostStart = screen.getByRole('button', { name: 'Mulai duel' }) as HTMLButtonElement;
  expect(hostStart.disabled).toBe(false);
  fireEvent.click(hostStart);
  expect(onStart).toHaveBeenCalledOnce();
  expect(screen.getByRole('status').textContent).toBe(
    'Kalian sudah siap. Tekan Mulai duel untuk masuk arena.',
  );
});

it('hides the host start action until an opponent joins and allows readiness before that', () => {
  const state = snapshot();
  state.players = [state.players[1]!];
  render(
    <WaitingRoom
      snapshot={state}
      selfId="TEST-self"
      qr=""
      qrError
      link="/student/pvp?room=TEST842AB123"
      disabled={false}
      onReady={vi.fn()}
      onStart={vi.fn()}
      onCopy={vi.fn()}
      onShare={vi.fn()}
      reconnectRemaining={{}}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Lawan belum bergabung' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Saya siap' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(screen.queryByRole('button', { name: 'Mulai duel' })).toBeNull();
  expect(screen.queryByRole('timer', { name: 'Sisa waktu room' })).toBeNull();
  expect(screen.getByRole('link', { name: '/student/pvp?room=TEST842AB123' })).toBeTruthy();
});
