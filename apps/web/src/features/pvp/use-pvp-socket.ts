'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useStudentToken } from '@/features/core-learning/student-session';
import type { PvpSnapshotDto } from '@/features/core-learning/generated-types';
import type { Acknowledgement, PvpEnvelope } from './generated-protocol';
type Command = Extract<PvpEnvelope, { requestId: string }>['event'];
type Ack = { payload: Acknowledgement };
export function usePvpSocket(enabled: boolean, matchId?: string) {
  const token = useStudentToken();
  const router = useRouter();
  const client = useQueryClient();
  const socket = useRef<Socket | null>(null);
  const [state, setState] = useState<PvpSnapshotDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const sending = useRef(false);
  const pending = useRef<{
    event: Command;
    payload: Record<string, unknown>;
    requestId: string;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const pendingMatch = useRef(matchId);
  useEffect(() => {
    // Token renewal keeps the request ID; changing matches or disabling PvP clears it.
    if (!enabled || pendingMatch.current !== matchId) pending.current = null;
    pendingMatch.current = matchId;
    setState(null);
    setConnected(false);
    setError(pending.current ? 'Periksa permintaan sebelumnya setelah koneksi pulih.' : '');
    setBusy(false);
    setUncertain(pending.current !== null);
    sending.current = false;
    if (!enabled) return;
    const url = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1');
    const s = io(`${url.origin}/pvp`, {
      auth: { authorization: `Bearer ${token}` },
      reconnectionAttempts: 10,
    });
    socket.current = s;
    s.on('connect', () => {
      setConnected(true);
      setError('');
      if (matchId)
        s.timeout(7000).emit(
          'match:reconnect',
          {
            event: 'match:reconnect',
            eventVersion: '1',
            requestId: crypto.randomUUID(),
            sentAt: new Date().toISOString(),
            payload: { matchId },
          },
          (err: Error | null, ack: Ack) => {
            if (socket.current !== s) return;
            if (err) setError('Snapshot pertandingan belum diterima. Coba sambungkan lagi.');
            else if (!ack.payload.ok)
              setError(ack.payload.error?.detail ?? 'Pertandingan belum dapat dilanjutkan.');
            else if (ack.payload.state?.matchId === matchId) setState(ack.payload.state);
          },
        );
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err: Error) =>
      setError(
        err.message === 'PVP_AUTH_REQUIRED'
          ? 'Sesi berakhir. Masuk kembali untuk melanjutkan.'
          : 'Koneksi PvP terputus. Coba sambungkan lagi.',
      ),
    );
    s.on('room:state', (event: { payload: PvpSnapshotDto }) => {
      if (socket.current === s && (!matchId || event.payload.matchId === matchId))
        setState(event.payload);
    });
    s.on(
      'invitation:received',
      () => void client.invalidateQueries({ queryKey: ['pvp-invitations'] }),
    );
    s.on('room:error', (event: { payload: { detail: string } }) => setError(event.payload.detail));
    return () => {
      socket.current = null;
      s.removeAllListeners();
      s.disconnect();
    };
  }, [enabled, matchId, token, client]);
  async function command(event: Command, payload: Record<string, unknown>) {
    if (sending.current) return;
    if (!socket.current?.connected) {
      setError('Koneksi PvP belum siap.');
      return;
    }
    if (
      pending.current &&
      (pending.current.event !== event ||
        JSON.stringify(pending.current.payload) !== JSON.stringify(payload))
    ) {
      setError('Periksa permintaan sebelumnya sebelum mengirim tindakan lain.');
      return;
    }
    pending.current ??= { event, payload, requestId: crypto.randomUUID() };
    sending.current = true;
    const currentSocket = socket.current;
    setBusy(true);
    setError('');
    try {
      const ack = (await currentSocket.timeout(7000).emitWithAck(event, {
        event,
        eventVersion: '1',
        requestId: pending.current.requestId,
        sentAt: new Date().toISOString(),
        payload,
      })) as Ack;
      if (socket.current !== currentSocket) return;
      if (!ack.payload.ok) {
        pending.current = null;
        setUncertain(false);
        setError(ack.payload.error?.detail ?? 'Permintaan belum berhasil.');
        if (event === 'invitation:respond')
          await client.invalidateQueries({ queryKey: ['student-notifications'] });
        return;
      }
      pending.current = null;
      setUncertain(false);
      if (ack.payload.state) {
        if (matchId && ack.payload.state.matchId !== matchId) return;
        setState(ack.payload.state);
        if (!matchId) router.push(`/student/pvp/${ack.payload.state.matchId}`);
      }
      await client.invalidateQueries({ queryKey: ['pvp-invitations'] });
      await client.invalidateQueries({ queryKey: ['pvp-availability'] });
      await client.invalidateQueries({ queryKey: ['student-notifications'] });
    } catch {
      if (socket.current !== currentSocket) return;
      setUncertain(true);
      setError('Jawaban server belum diterima. Sambungkan lagi untuk memeriksa state tersimpan.');
    } finally {
      if (socket.current === currentSocket) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  return {
    state: matchId && state?.matchId !== matchId ? null : state,
    error,
    busy,
    connected,
    uncertain,
    command,
    retry: () => {
      if (pending.current) void command(pending.current.event, pending.current.payload);
    },
    reconnect: () => {
      if (socket.current?.connected) {
        setState(null);
        void client.invalidateQueries({ queryKey: ['pvp-match', matchId] });
      } else socket.current?.connect();
    },
  };
}
