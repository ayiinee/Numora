'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { request } from '@/features/core-learning/api';
import { useStudentToken } from '@/features/core-learning/student-session';
import type { PvpAvailabilityDto, PvpSnapshotDto } from '@/features/core-learning/generated-types';
import { pvpAvailabilityKey, pvpMatchKey, pvpMatchQuery } from './pvp-match-query';
import type { Acknowledgement, PvpEnvelope } from './generated-protocol';
type Command = Extract<PvpEnvelope, { requestId: string }>['event'];
type Ack = { payload: Acknowledgement };
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';
const isLobbyEntry = (event?: Command) => event === 'room:create' || event === 'room:join';
export function usePvpSocket(enabled: boolean, matchId?: string) {
  const token = useStudentToken();
  const navigate = useRouter().push;
  const [openingRoom, startRoomNavigation] = useTransition();
  const client = useQueryClient();
  const openRoom = useCallback(
    (id: string) => {
      if (!client.getQueryData(pvpMatchKey(id)))
        void client.prefetchQuery(pvpMatchQuery(token, id));
      startRoomNavigation(() => navigate(`/student/pvp/${id}`));
    },
    [client, navigate, token],
  );
  const socket = useRef<Socket | null>(null);
  const [state, setState] = useState<PvpSnapshotDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const connected = connectionState === 'connected';
  const [checkingRoom, setCheckingRoom] = useState(false);
  const roomCheck = useRef<Socket | null>(null);
  const sending = useRef(false);
  const pending = useRef<{
    event: Command;
    payload: Record<string, unknown>;
    requestId: string;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const pendingMatch = useRef(matchId);
  const observedRoom = useRef<{ matchId: string; active: boolean } | null>(null);
  const receiveSnapshot = useCallback(
    (snapshot: PvpSnapshotDto, membershipCommand = false) => {
      setState(snapshot);
      if (matchId && !client.getQueryData(pvpMatchKey(matchId)))
        client.setQueryData(pvpMatchKey(matchId), snapshot);
      const active =
        snapshot.participantActive !== false &&
        snapshot.status !== 'FINISHED' &&
        snapshot.status !== 'CANCELLED';
      const previous = observedRoom.current;
      observedRoom.current = { matchId: snapshot.matchId, active };

      if (!matchId && active && isLobbyEntry(pending.current?.event)) {
        pending.current = null;
        setUncertain(false);
        setError('');
        setCheckingRoom(false);
        client.setQueryData(pvpMatchKey(snapshot.matchId), snapshot);
        openRoom(snapshot.matchId);
        membershipCommand = true;
      }
      if (active) {
        if (!membershipCommand) return;
      } else if (previous?.matchId === snapshot.matchId) {
        if (!previous.active) return; // A terminal ACK can be followed by the same broadcast.
      } else if (
        !membershipCommand &&
        client.getQueryData<PvpAvailabilityDto>(pvpAvailabilityKey)?.activeMatchId !==
          snapshot.matchId
      ) {
        return;
      }
      client.setQueryData<PvpAvailabilityDto>(pvpAvailabilityKey, (cached) => {
        if (!cached) return cached;
        if (active) return { ...cached, activeMatchId: snapshot.matchId };
        return cached.activeMatchId === snapshot.matchId
          ? { ...cached, activeMatchId: null }
          : cached;
      });
      void client.invalidateQueries({ queryKey: pvpAvailabilityKey });
    },
    [client, matchId, openRoom],
  );
  const checkLobbyRoom = useCallback(
    async (currentSocket: Socket, resume: boolean) => {
      if (matchId || roomCheck.current === currentSocket) return;
      const attempt = pending.current;
      roomCheck.current = currentSocket;
      setCheckingRoom(true);
      try {
        const availability = await request<PvpAvailabilityDto>(token, '/pvp/availability', {
          signal: AbortSignal.timeout(7000),
        });
        if (socket.current !== currentSocket || pending.current !== attempt) return;
        if (availability.activeMatchId) {
          pending.current = null;
          setUncertain(false);
          setError('');
          client.setQueryData(pvpAvailabilityKey, availability);
          if (resume) openRoom(availability.activeMatchId);
          return;
        }
        setError('Room belum ditemukan. Coba lagi.');
      } catch {
        if (socket.current === currentSocket && pending.current === attempt)
          setError('Room belum bisa diperiksa. Coba lagi.');
      } finally {
        if (roomCheck.current === currentSocket) {
          roomCheck.current = null;
          if (socket.current === currentSocket) setCheckingRoom(false);
        }
      }
    },
    [client, matchId, openRoom, token],
  );
  useEffect(() => {
    // Token renewal keeps the request ID; changing matches or disabling PvP clears it.
    if (!enabled || pendingMatch.current !== matchId) pending.current = null;
    pendingMatch.current = matchId;
    setState(null);
    setConnectionState(enabled ? 'connecting' : 'idle');
    setCheckingRoom(false);
    setError(pending.current && matchId ? 'Coba lagi setelah koneksi pulih.' : '');
    setBusy(false);
    setUncertain(pending.current !== null);
    sending.current = false;
    if (!enabled) return;
    const url = new URL(
      process.env.NEXT_PUBLIC_GENERATOR_DEMO === 'true'
        ? (process.env.NEXT_PUBLIC_MAIN_API_URL ?? 'http://localhost:3001/api/v1')
        : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'),
    );
    const s = io(`${url.origin}/pvp`, {
      auth: { authorization: `Bearer ${token}` },
      reconnectionAttempts: 10,
    });
    socket.current = s;
    s.on('connect', () => {
      setConnectionState('connected');
      setError('');
      if (!matchId && isLobbyEntry(pending.current?.event)) void checkLobbyRoom(s, true);
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
            if (err) setError('Duel belum bisa dilanjutkan. Coba sambungkan kembali.');
            else if (!ack.payload.ok)
              setError(ack.payload.error?.detail ?? 'Pertandingan belum dapat dilanjutkan.');
            else if (ack.payload.state?.matchId === matchId) receiveSnapshot(ack.payload.state);
          },
        );
    });
    s.on('disconnect', () => {
      setError('');
      setConnectionState('disconnected');
    });
    s.on('connect_error', (err: Error) => {
      setConnectionState('disconnected');
      setError(
        err.message === 'PVP_AUTH_REQUIRED'
          ? 'Sesi berakhir. Masuk kembali untuk melanjutkan.'
          : 'Sambungkan kembali untuk masuk ke room.',
      );
    });
    s.on('room:state', (event: { payload: PvpSnapshotDto }) => {
      if (socket.current === s && (!matchId || event.payload.matchId === matchId))
        receiveSnapshot(event.payload);
    });
    s.on(
      'invitation:received',
      () => void client.invalidateQueries({ queryKey: ['pvp-invitations'] }),
    );
    s.on('room:error', (event: { payload: { detail: string } }) => {
      if (!sending.current && !roomCheck.current) setError(event.payload.detail);
    });
    return () => {
      socket.current = null;
      if (roomCheck.current === s) roomCheck.current = null;
      s.removeAllListeners();
      s.disconnect();
    };
  }, [enabled, matchId, token, client, receiveSnapshot, checkLobbyRoom]);
  async function command(event: Command, payload: Record<string, unknown>) {
    if (sending.current || roomCheck.current) return;
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
    const attempt = pending.current;
    sending.current = true;
    const currentSocket = socket.current;
    setBusy(true);
    setError('');
    try {
      const ack = (await currentSocket.timeout(7000).emitWithAck(event, {
        event,
        eventVersion: '1',
        requestId: attempt.requestId,
        sentAt: new Date().toISOString(),
        payload,
      })) as Ack;
      if (socket.current !== currentSocket || pending.current !== attempt) return;
      if (!ack.payload.ok) {
        pending.current = null;
        setUncertain(false);
        if (!matchId && ack.payload.error?.code === 'PVP_ACTIVE_ROOM_EXISTS') {
          await checkLobbyRoom(currentSocket, false);
          return;
        }
        setError(ack.payload.error?.detail ?? 'Coba lagi sebentar.');
        if (event === 'invitation:respond')
          await client.invalidateQueries({ queryKey: ['student-notifications'] });
        return;
      }
      pending.current = null;
      setUncertain(false);
      if (ack.payload.state) {
        if (matchId && ack.payload.state.matchId !== matchId) return;
        const membershipCommand =
          event === 'room:create' ||
          event === 'room:join' ||
          event === 'room:leave' ||
          event === 'room:cancel' ||
          event === 'invitation:respond';
        receiveSnapshot(ack.payload.state, membershipCommand);
        if (!matchId) {
          client.setQueryData(pvpMatchKey(ack.payload.state.matchId), ack.payload.state);
          openRoom(ack.payload.state.matchId);
        }
      }
      await client.invalidateQueries({ queryKey: ['pvp-invitations'] });
      await client.invalidateQueries({ queryKey: ['student-notifications'] });
    } catch {
      if (socket.current !== currentSocket || pending.current !== attempt) return;
      setUncertain(true);
      if (!matchId && isLobbyEntry(event)) await checkLobbyRoom(currentSocket, true);
      else
        setError(
          event === 'answer:submit'
            ? 'Jawabanmu belum bisa dikonfirmasi. Coba periksa lagi.'
            : 'Tindakan ini belum bisa dikonfirmasi. Coba lagi.',
        );
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
    connectionState,
    checkingRoom,
    openingRoom,
    uncertain,
    retryEvent: uncertain ? pending.current?.event : undefined,
    command,
    retry: () => {
      if (pending.current) void command(pending.current.event, pending.current.payload);
    },
    reconnect: () => {
      if (socket.current?.connected) {
        if (!matchId) void checkLobbyRoom(socket.current, isLobbyEntry(pending.current?.event));
        else {
          setState(null);
          void client.invalidateQueries({ queryKey: pvpMatchKey(matchId) });
        }
      } else if (socket.current) {
        setConnectionState('connecting');
        setError('');
        socket.current.connect();
      }
    },
  };
}
