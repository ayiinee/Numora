'use client';

import Link from 'next/link';
import { StudentMascot } from '@/components/student-mascot';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePvpSocket } from './use-pvp-socket';
import { pvpAvailabilityKey, pvpMatchQuery } from './pvp-match-query';
import { PvpWaitingFrame } from './pvp-waiting-frame';
import QRCode from 'qrcode';
import { Avatar, Button, Card, Dialog, Icon, Tabs } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { StudentSectionHeader } from '@/features/core-learning/student-section-header';
import {
  hasLeaderboardPodiumTie,
  LeaderboardPodium,
  LeaderboardRankingList,
} from '@/features/core-learning/leaderboard-podium';
import type { LeaderboardDto } from '@/features/core-learning/generated-types';
import {
  BattleRoom,
  DifficultyChoices,
  JoinRoomForm,
  MatchOutcome,
  PvpHeader,
  PvpHero,
  PvpRules,
  WaitingRoom,
  type Difficulty,
} from './pvp-presentation';
import { useAuth } from '@/features/onboarding/auth';
import { request } from '@/features/core-learning/api';
import { useStudentToken } from '@/features/core-learning/student-session';
import { useUnsavedWarning } from '@/features/core-learning/use-unsaved-warning';
import './pvp-lobby.css';
import { DataState, LearningFrame, Status } from '@/features/core-learning/ui';
import type {
  PvpAvailabilityDto,
  PvpInvitesDto,
  StudentPeersDto,
} from '@/features/core-learning/generated-types';

export function PvpScreen() {
  const token = useStudentToken();
  const client = useQueryClient();
  const availability = useQuery({
    queryKey: pvpAvailabilityKey,
    queryFn: () => request<PvpAvailabilityDto>(token, '/pvp/availability'),
  });
  const socket = usePvpSocket(availability.data?.available === true);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [tab, setTab] = useState('create');
  const [code, setCode] = useState('');
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('room');
    if (shared) {
      setCode(shared.trim().toUpperCase());
      setTab('join');
    }
  }, []);
  const invitations = useQuery({
    queryKey: ['pvp-invitations'],
    queryFn: () => request<PvpInvitesDto>(token, '/pvp/invitations'),
    enabled: availability.data?.available === true,
  });
  const ranking = useQuery({
    queryKey: ['student-leaderboard', 'pvp', difficulty],
    queryFn: () => request<LeaderboardDto>(token, `/leaderboards/pvp?difficulty=${difficulty}`),
    enabled: availability.data?.available === true,
  });
  const rankingEntries = ranking.data?.entries ?? [];
  const tied = hasLeaderboardPodiumTie(rankingEntries);
  const checkingAvailability =
    availability.isPending || (!availability.isFetchedAfterMount && availability.isFetching);
  const activeMatchId =
    checkingAvailability || availability.isError ? null : availability.data?.activeMatchId;
  const disabled = socket.busy || socket.checkingRoom || socket.uncertain || !socket.connected;
  const selectedAvailable =
    availability.data?.difficulties?.find((item) => item.difficulty === difficulty)?.available !==
    false;
  return (
    <AppShell
      title="PvP Duel"
      className="pvp-lobby-shell"
      mobileHeader={<StudentSectionHeader title="PvP Duel" />}
    >
      <div className="pvp-lobby-layout">
        <div className="pvp-lobby-main">
          <PvpHero />

          {socket.openingRoom ? (
            <p role="status">Membuka ruang tunggu…</p>
          ) : activeMatchId && !socket.busy && !socket.checkingRoom ? (
            <Status title="Kamu punya room aktif">
              <p>
                Lanjutkan duel dari room yang sudah kamu masuki. Untuk ganti room, keluar dari sana
                dulu.
              </p>
              <Link
                className="button-link"
                href={`/student/pvp/${activeMatchId}`}
                onNavigate={() => void client.prefetchQuery(pvpMatchQuery(token, activeMatchId))}
              >
                Lanjutkan ke room
              </Link>
            </Status>
          ) : checkingAvailability || availability.isError ? (
            <DataState
              pending={checkingAvailability}
              error={availability.error}
              retry={() => void availability.refetch()}
            />
          ) : !availability.data.available ? (
            <Status title="PvP belum tersedia">
              {availability.data.message} Latihanmu tetap tersedia.
              <p>
                <Link className="button-link" href="/student/learn">
                  Mulai latihan
                </Link>
              </p>
            </Status>
          ) : (
            <>
              {socket.connectionState === 'disconnected' && (
                <Status title="Koneksi terputus">
                  <p>{socket.error || 'Sambungkan kembali untuk masuk ke room.'}</p>
                  <Button variant="secondary" onClick={socket.reconnect}>
                    Sambungkan kembali
                  </Button>
                </Status>
              )}
              {socket.connectionState === 'connecting' && (
                <p role="status">Menghubungkan ke PvP…</p>
              )}
              <Tabs
                label="Buat atau gabung duel"
                value={tab}
                onChange={setTab}
                items={[
                  {
                    value: 'create',
                    label: (
                      <>
                        <Icon name="gamepad" width={16} height={16} />
                        Buat Room Baru
                      </>
                    ),
                    content: (
                      <div className="pvp-create-panel">
                        <DifficultyChoices
                          value={difficulty}
                          onChange={setDifficulty}
                          disabled={socket.busy || socket.uncertain}
                          availability={availability.data.difficulties}
                          contentNotice={availability.data.contentNotice}
                        />
                        <Button
                          fullWidth
                          loading={
                            socket.connectionState === 'connecting' ||
                            (socket.busy && !socket.checkingRoom)
                          }
                          disabled={disabled || !selectedAvailable}
                          onClick={() => void socket.command('room:create', { difficulty })}
                        >
                          Buat room
                        </Button>
                      </div>
                    ),
                  },
                  {
                    value: 'join',
                    label: (
                      <>
                        <Icon name="users" width={16} height={16} />
                        Gabung via Kode
                      </>
                    ),
                    content: (
                      <JoinRoomForm
                        code={code}
                        onChange={setCode}
                        disabled={disabled}
                        busy={tab === 'join' && socket.busy && !socket.checkingRoom}
                        onJoin={() =>
                          void socket.command('room:join', { roomCode: code.trim().toUpperCase() })
                        }
                      />
                    ),
                  },
                ]}
              />
              {socket.checkingRoom ? (
                <p role="status">Sebentar, kami sedang mencari room kamu…</p>
              ) : socket.error && socket.connectionState !== 'disconnected' ? (
                <p role="alert" className="pvp-command-error">
                  {socket.error}
                </p>
              ) : null}
              {socket.uncertain && !socket.checkingRoom && socket.connected && (
                <Button
                  variant="secondary"
                  disabled={socket.busy || !socket.connected}
                  onClick={socket.retry}
                >
                  {socket.retryEvent === 'room:create'
                    ? 'Coba buat lagi'
                    : socket.retryEvent === 'room:join'
                      ? 'Coba gabung lagi'
                      : 'Coba lagi'}
                </Button>
              )}
            </>
          )}
          <Link
            className="pvp-leaderboard-link"
            href={`/student/leaderboards?difficulty=${difficulty}`}
          >
            <Icon name="trophy" />
            Lihat peringkat PvP
            <Icon name="chevron" />
          </Link>
          {availability.data?.available === true && (
            <Card className={`student-scoreboard student-scoreboard--${difficulty}`}>
              <div className="student-scoreboard__stage">
                <div className="pvp-ranking-section-heading">
                  <h2>
                    <Icon name="trophy" width={20} height={20} />
                    Top 3 minggu ini
                  </h2>
                </div>
                {ranking.isPending || ranking.isError ? (
                  <DataState
                    pending={ranking.isPending}
                    error={ranking.error}
                    retry={() => void ranking.refetch()}
                  />
                ) : ranking.data.policyPending ? (
                  <p>Peringkat belum tersedia. Rekor menunggu aturan PvP.</p>
                ) : !rankingEntries.length ? (
                  <p>Belum ada rekor pada periode ini.</p>
                ) : !tied ? (
                  <LeaderboardPodium
                    entries={rankingEntries}
                    ownEntry={ranking.data.ownEntry}
                    unit={ranking.data.unit}
                    label="Podium Global PvP"
                  />
                ) : null}
              </div>
              {ranking.isSuccess && !ranking.data.policyPending && tied && (
                <div className="pvp-ranking-list">
                  <LeaderboardRankingList
                    entries={rankingEntries.slice(0, 3)}
                    ownEntry={ranking.data.ownEntry}
                    unit={ranking.data.unit}
                    label="Podium Global PvP"
                  />
                </div>
              )}
            </Card>
          )}
        </div>
        <aside className="pvp-lobby-context">
          <PvpRules />
          {availability.data?.available === true && (
            <Card className="pvp-invitations">
              <h2>Undangan teman sekelas</h2>
              {invitations.isPending || invitations.isError ? (
                <DataState
                  pending={invitations.isPending}
                  error={invitations.error}
                  retry={() => void invitations.refetch()}
                />
              ) : !invitations.data.invites.length ? (
                <p>Belum ada undangan aktif.</p>
              ) : (
                <ul>
                  {invitations.data.invites.map((invite) => (
                    <li key={invite.id}>
                      <Avatar name={invite.senderName} />
                      <div>
                        <strong>{invite.senderName}</strong>
                        <span>{invite.roomCode}</span>
                      </div>
                      <div>
                        <Button
                          size="sm"
                          disabled={disabled || !!activeMatchId}
                          onClick={() =>
                            void socket.command('invitation:respond', {
                              inviteId: invite.id,
                              accept: true,
                            })
                          }
                        >
                          Terima
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={disabled}
                          onClick={() =>
                            void socket.command('invitation:respond', {
                              inviteId: invite.id,
                              accept: false,
                            })
                          }
                        >
                          Tolak
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

export function PvpMatchScreen() {
  const token = useStudentToken();
  const router = useRouter();
  const { state: auth } = useAuth();
  const { matchId } = useParams<{ matchId: string }>();
  const client = useQueryClient();
  const result = useQuery(pvpMatchQuery(token, matchId));
  const room = result.data;
  const transportActive = room
    ? room.participantActive !== false && room.status !== 'FINISHED' && room.status !== 'CANCELLED'
    : !result.isError &&
      client.getQueryData<PvpAvailabilityDto>(pvpAvailabilityKey)?.activeMatchId === matchId;
  const socket = usePvpSocket(transportActive, matchId);
  const snapshot = socket.state ?? room;
  const isSchoolStudent = auth.status === 'ready' && auth.profile.studentAffiliation === 'SCHOOL';
  const peers = useQuery({
    queryKey: ['pvp-classmates'],
    queryFn: () => request<StudentPeersDto>(token, '/pvp/classmates'),
    enabled:
      isSchoolStudent &&
      transportActive &&
      (snapshot?.status === 'WAITING' || snapshot?.status === 'READY') &&
      snapshot.creatorStudentId === auth.profile.id,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState(false);
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [roomRemaining, setRoomRemaining] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveRequested, setLeaveRequested] = useState(false);
  const isParticipating =
    !!snapshot &&
    snapshot.participantActive !== false &&
    snapshot.status !== 'FINISHED' &&
    snapshot.status !== 'CANCELLED';
  const openLeave = useCallback(() => setConfirmLeave(true), []);
  useUnsavedWarning(false, false, undefined, {
    confirmNavigation: isParticipating,
    customDialog: true,
    onNavigationAttempt: openLeave,
    navigationFallbackHref: '/student/pvp',
  });
  function closeLeave() {
    setConfirmLeave(false);
    setLeaveRequested(false);
  }
  const [reconnectRemaining, setReconnectRemaining] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!snapshot) return;
    const server = Date.parse(snapshot.serverTime);
    const received = performance.now();
    const tick = () =>
      setReconnectRemaining(
        Object.fromEntries(
          snapshot.players
            .filter((p) => p.connectionStatus === 'DISCONNECTED' && p.reconnectDeadlineAt)
            .map((p) => [
              p.studentId,
              Math.max(
                0,
                Math.ceil(
                  (Date.parse(p.reconnectDeadlineAt!) - server - (performance.now() - received)) /
                    1000,
                ),
              ),
            ]),
        ),
      );
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [snapshot]);
  useEffect(() => {
    setSelected(snapshot?.question?.selectedOptionId ?? null);
  }, [snapshot?.question?.id, snapshot?.question?.selectedOptionId]);
  useEffect(() => {
    if (!snapshot?.roomCode) return;
    const url = `${window.location.origin}/student/pvp?room=${encodeURIComponent(snapshot.roomCode)}`;
    let active = true;
    setLink(url);
    setQr('');
    setQrError(false);
    void QRCode.toDataURL(url, { width: 192, margin: 1 })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active) {
          setQrError(true);
          setNotice('QR belum dapat ditampilkan. Gunakan kode atau link room.');
        }
      });
    return () => {
      active = false;
    };
  }, [snapshot?.roomCode]);
  useEffect(() => {
    if (!snapshot?.expiresAt) return;
    const received = performance.now();
    const deadline = Date.parse(snapshot.expiresAt) - Date.parse(snapshot.serverTime);
    const tick = () =>
      setRoomRemaining(Math.max(0, Math.ceil((deadline - (performance.now() - received)) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [snapshot]);
  useEffect(() => {
    if (!snapshot?.question) return;
    const deadline = Date.parse(snapshot.question.deadlineAt);
    const serverAtReceipt = Date.parse(snapshot.serverTime);
    const received = performance.now();
    const update = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil((deadline - serverAtReceipt - (performance.now() - received)) / 1000),
        ),
      );
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [snapshot]);
  if (!snapshot)
    return (
      <PvpWaitingFrame>
        <div className="pvp-match-content">
          <DataState
            pending={result.isPending}
            error={result.error}
            retry={() => void result.refetch()}
            recovery={{ href: '/student/pvp', label: 'Kembali ke PvP' }}
          />
        </div>
      </PvpWaitingFrame>
    );
  const self = snapshot.players.find(
    (p) => auth.status === 'ready' && p.studentId === auth.profile.id,
  );
  const closed = snapshot.status === 'FINISHED' || snapshot.status === 'CANCELLED';
  const left = snapshot.participantActive === false;
  const active = transportActive;
  const waiting = !closed && !left && snapshot.status !== 'RUNNING';
  const disabled = !active || socket.busy || socket.uncertain || !socket.connected;
  const title = closed
    ? 'Hasil Duel PvP'
    : left
      ? 'Duel PvP'
      : snapshot.status === 'RUNNING'
        ? 'Duel Berlangsung'
        : 'Ruang Tunggu Duel';
  function copy(value: string, label: string) {
    void navigator.clipboard
      .writeText(value)
      .then(() => setNotice(`${label} disalin.`))
      .catch(() => setNotice(`Salin ${label.toLowerCase()} room secara manual.`));
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: 'Duel PvP Numora', url: link });
      else copy(link, 'Link');
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setNotice('Link belum dapat dibagikan. Gunakan Salin link.');
    }
  }
  const peerPanel =
    snapshot.creatorStudentId === self?.studentId ? (
      <Card className="pvp-classmates">
        <h2>
          <Icon name="users" />
          Undang teman sekelas
        </h2>
        {!isSchoolStudent ? (
          <p>Belum ada teman sekelas. Kamu tetap dapat membagikan link room.</p>
        ) : peers.isPending || peers.isError ? (
          active && (
            <DataState
              pending={peers.isPending}
              error={peers.error}
              retry={() => void peers.refetch()}
            />
          )
        ) : !peers.data.classmates.length ? (
          <p>Belum ada teman sekelas. Kamu tetap dapat membagikan link room.</p>
        ) : (
          <ul>
            {peers.data.classmates.map((player) => (
              <li key={player.studentId}>
                <Avatar name={player.displayName} />
                <strong>{player.displayName}</strong>
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    void socket.command('invitation:send', {
                      matchId,
                      recipientStudentId: player.studentId,
                    })
                  }
                >
                  Undang
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ) : undefined;
  const roomContent = (
    <>
      <div className="pvp-match-content">
        {active && socket.connectionState === 'disconnected' && !closed && !left && (
          <Status title="Koneksi terputus" illustration={<StudentMascot pose="offline" compact />}>
            Server memberi kesempatan reconnect selama 20 detik.
            <Button variant="secondary" onClick={socket.reconnect}>
              Sambungkan lagi
            </Button>
          </Status>
        )}
        {left ? (
          <Status title="Kamu sudah keluar dari room">
            Host dapat menunggu pemain pengganti.
            <Link className="button-link" href="/student/pvp">
              Kembali ke PvP
            </Link>
          </Status>
        ) : closed ? (
          <MatchOutcome snapshot={snapshot} selfId={self?.studentId} />
        ) : snapshot.status === 'RUNNING' && snapshot.question ? (
          <BattleRoom
            snapshot={snapshot}
            selfId={self?.studentId}
            remaining={remaining}
            selected={selected}
            disabled={disabled || snapshot.question.answered || remaining === 0}
            onSelect={setSelected}
            onAnswer={() =>
              void socket.command('answer:submit', {
                matchId,
                questionId: snapshot.question!.id,
                optionId: selected,
              })
            }
            reconnectRemaining={reconnectRemaining}
          />
        ) : snapshot.status === 'RUNNING' ? (
          <Status title="Menunggu soal">
            Soal berikutnya akan tampil setelah snapshot diterima dari server.
          </Status>
        ) : (
          <WaitingRoom
            snapshot={snapshot}
            roomRemaining={snapshot.expiresAt ? roomRemaining : undefined}
            selfId={self?.studentId}
            qr={qr}
            qrError={qrError}
            link={link}
            disabled={disabled}
            onReady={() => void socket.command('player:ready', { matchId })}
            onStart={() => void socket.command('match:start', { matchId })}
            onCopy={copy}
            onShare={() => void share()}
            peers={peerPanel}
            reconnectRemaining={reconnectRemaining}
          />
        )}
        {socket.error && !confirmLeave && (
          <p role="alert" className="pvp-command-error">
            {socket.error}
          </p>
        )}
        {socket.uncertain && !confirmLeave && (
          <Button
            variant="secondary"
            disabled={socket.busy || !socket.connected}
            onClick={socket.retry}
          >
            Periksa permintaan sebelumnya
          </Button>
        )}
        {notice && (
          <p role="status" className="pvp-notice">
            {notice}
          </p>
        )}
      </div>
      <Dialog
        open={confirmLeave && isParticipating}
        onClose={closeLeave}
        title={snapshot.status === 'RUNNING' ? 'Menyerah dari duel?' : 'Keluar dari room?'}
        pending={socket.busy}
        description={
          snapshot.status === 'RUNNING'
            ? 'Keluar berarti menyerah. Hasil akhir ditetapkan server.'
            : 'Kamu akan keluar dari ruang tunggu. Perubahan room mengikuti server.'
        }
        actions={
          <>
            <Button variant="secondary" disabled={socket.busy} onClick={closeLeave}>
              Tetap di sini
            </Button>
            {!socket.connected ? (
              <>
                <Button variant="secondary" disabled={socket.busy} onClick={socket.reconnect}>
                  Sambungkan lagi
                </Button>
                <Button
                  variant="danger-outline"
                  disabled={socket.busy}
                  onClick={() => router.replace('/student/pvp')}
                >
                  Keluar halaman
                </Button>
              </>
            ) : socket.uncertain ? (
              <Button variant="secondary" disabled={socket.busy} onClick={socket.retry}>
                Periksa permintaan sebelumnya
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={socket.busy && leaveRequested}
                disabled={disabled}
                onClick={() => {
                  setLeaveRequested(true);
                  void socket.command('room:leave', { matchId });
                }}
              >
                Ya, keluar
              </Button>
            )}
          </>
        }
      >
        {!socket.connected && (
          <p>
            Jika kamu keluar halaman saat offline, server tetap menentukan hasil atau status room.
          </p>
        )}
        {socket.busy && leaveRequested && <p role="status">Menunggu konfirmasi server…</p>}
        {socket.error && (
          <p role="alert" className="pvp-command-error">
            {socket.error}
          </p>
        )}
      </Dialog>
    </>
  );
  if (waiting) return <PvpWaitingFrame onLeave={openLeave}>{roomContent}</PvpWaitingFrame>;
  return (
    <LearningFrame title={title} focus className="pvp-match-shell">
      <PvpHeader
        title={title}
        connected={!closed && !left && active ? socket.connected : undefined}
        onLeave={isParticipating ? openLeave : undefined}
        leaveLabel={snapshot.status === 'RUNNING' ? 'Menyerah' : 'Keluar'}
        showProfile={!isParticipating}
      />
      {roomContent}
    </LearningFrame>
  );
}
