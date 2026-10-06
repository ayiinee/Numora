'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePvpSocket } from './use-pvp-socket';
import QRCode from 'qrcode';
import { Avatar, Button, Card, Dialog, Icon, Tabs } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { StudentSectionHeader } from '@/features/core-learning/student-section-header';
import { LeaderboardPodium } from '@/features/core-learning/leaderboard-podium';
import { learningApi } from '@/features/core-learning/api';
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
import { DataState, LearningFrame, Status } from '@/features/core-learning/ui';
import type {
  PvpAvailabilityDto,
  PvpInvitesDto,
  PvpSnapshotDto,
  StudentPeersDto,
} from '@/features/core-learning/generated-types';

export function PvpScreen() {
  const token = useStudentToken();
  const availability = useQuery({
    queryKey: ['pvp-availability'],
    queryFn: () => request<PvpAvailabilityDto>(token, '/pvp/availability'),
  });
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const socket = usePvpSocket(availability.data?.available === true);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [tab, setTab] = useState('create');
  const [code, setCode] = useState('');
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('room');
    if (shared) {
      setCode(shared);
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
  const disabled = socket.busy || socket.uncertain || !socket.connected;
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
          <div className="pvp-lobby-meta" aria-label="Informasi duel">
            <span>
              <Icon name="users" width={14} height={14} />1 vs 1
            </span>
            <span>
              <Icon name="school" width={14} height={14} />
              {dashboard.data?.class?.schoolName ?? 'Mandiri & Sekolah'}
            </span>
            <span>
              <Icon name="clock" width={14} height={14} />
              10 Soal
            </span>
          </div>
          <PvpHero />

          {availability.data?.activeMatchId && (
            <Status title="Kamu memiliki room aktif">
              <Link
                className="button-link"
                href={`/student/pvp/${availability.data.activeMatchId}`}
              >
                Lanjutkan room aktif
              </Link>
            </Status>
          )}
          <Link
            className="pvp-leaderboard-link"
            href={`/student/leaderboards?difficulty=${difficulty}`}
          >
            <Icon name="trophy" />
            LEADERBOARD PVP
            <Icon name="chevron" />
          </Link>
          {availability.isPending || availability.isError ? (
            <DataState
              pending={availability.isPending}
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
              <Card className="pvp-lobby-podium" aria-label="Podium Global PvP">
                <h2 className="sr-only">Podium Global PvP</h2>
                {ranking.isPending || ranking.isError ? (
                  <DataState
                    pending={ranking.isPending}
                    error={ranking.error}
                    retry={() => void ranking.refetch()}
                  />
                ) : ranking.data.policyPending ? (
                  <p>Peringkat belum tersedia. Rekor menunggu aturan PvP.</p>
                ) : ranking.data.entries.length ? (
                  <LeaderboardPodium
                    entries={ranking.data.entries}
                    ownEntry={ranking.data.ownEntry}
                    unit={ranking.data.unit}
                    label="Podium Global PvP"
                  />
                ) : (
                  <p>Belum ada rekor pada periode ini.</p>
                )}
              </Card>
              {!socket.connected && (
                <Status title="Menghubungkan PvP">
                  <Button variant="secondary" onClick={socket.reconnect}>
                    Sambungkan lagi
                  </Button>
                </Status>
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
                        />
                        <Button
                          fullWidth
                          loading={socket.busy}
                          disabled={
                            disabled || !selectedAvailable || !!availability.data.activeMatchId
                          }
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
                        busy={socket.busy}
                        onJoin={() =>
                          void socket.command('room:join', { roomCode: code.trim().toUpperCase() })
                        }
                      />
                    ),
                  },
                ]}
              />
            </>
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
                          disabled={disabled}
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
      {socket.error && (
        <p role="alert" className="pvp-command-error">
          {socket.error}
        </p>
      )}
      {socket.uncertain && (
        <Button
          variant="secondary"
          disabled={socket.busy || !socket.connected}
          onClick={socket.retry}
        >
          Periksa permintaan sebelumnya
        </Button>
      )}
    </AppShell>
  );
}

export function PvpMatchScreen() {
  const token = useStudentToken();
  const { state: auth } = useAuth();
  const { matchId } = useParams<{ matchId: string }>();
  const availability = useQuery({
    queryKey: ['pvp-availability'],
    queryFn: () => request<PvpAvailabilityDto>(token, '/pvp/availability'),
  });
  const result = useQuery({
    queryKey: ['pvp-match', matchId],
    queryFn: () => request<PvpSnapshotDto>(token, `/pvp/matches/${encodeURIComponent(matchId)}`),
  });
  const transportActive =
    availability.data?.available === true || availability.data?.activeMatchId === matchId;
  const socket = usePvpSocket(transportActive, matchId);
  const snapshot = socket.state ?? result.data;
  const peers = useQuery({
    queryKey: ['pvp-classmates'],
    queryFn: () => request<StudentPeersDto>(token, '/pvp/classmates'),
    enabled: availability.data?.available === true,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState(false);
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [roomRemaining, setRoomRemaining] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
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
  if (result.isPending || result.isError)
    return (
      <LearningFrame title="Pertandingan PvP" focus className="pvp-match-shell">
        <PvpHeader title="Pertandingan PvP" />
        <div className="pvp-match-content">
          <DataState
            pending={result.isPending}
            error={result.error}
            retry={() => void result.refetch()}
          />
        </div>
      </LearningFrame>
    );
  if (!snapshot) return null;
  const self = snapshot.players.find(
    (p) => auth.status === 'ready' && p.studentId === auth.profile.id,
  );
  const closed = snapshot.status === 'FINISHED' || snapshot.status === 'CANCELLED';
  const active = transportActive;
  const disabled = !active || socket.busy || socket.uncertain || !socket.connected;
  const title = closed
    ? 'Hasil Duel PvP'
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
        {peers.isPending || peers.isError ? (
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
  return (
    <LearningFrame title={title} focus className="pvp-match-shell">
      <PvpHeader
        title={title}
        connected={!closed && active ? socket.connected : undefined}
        onLeave={!closed ? () => setConfirmLeave(true) : undefined}
      />
      <div className="pvp-match-content">
        {!closed && snapshot.status !== 'RUNNING' && snapshot.expiresAt && (
          <p role="timer" aria-label="Sisa waktu room">
            Room berlaku {roomRemaining} detik lagi.
          </p>
        )}

        {availability.isError && !closed && (
          <DataState
            pending={false}
            error={availability.error}
            retry={() => void availability.refetch()}
          />
        )}
        {availability.data?.available === false && !active && !closed && (
          <Status title="PvP belum tersedia">{availability.data.message}</Status>
        )}
        {active && !socket.connected && !closed && (
          <Status title="Koneksi terputus">
            Server memberi kesempatan reconnect selama 20 detik.
            <Button variant="secondary" onClick={socket.reconnect}>
              Sambungkan lagi
            </Button>
          </Status>
        )}
        {snapshot.participantActive === false ? (
          <Status title="Kamu sudah keluar dari room">
            Host dapat menunggu pemain pengganti. <Link href="/student/pvp">Kembali ke PvP</Link>
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
            onLeave={() => setConfirmLeave(true)}
            reconnectRemaining={reconnectRemaining}
          />
        ) : snapshot.status === 'RUNNING' ? (
          <Status title="Menunggu soal">
            Soal berikutnya akan tampil setelah snapshot diterima dari server.
          </Status>
        ) : (
          <WaitingRoom
            snapshot={snapshot}
            selfId={self?.studentId}
            qr={qr}
            qrError={qrError}
            link={link}
            disabled={disabled}
            onReady={() => void socket.command('player:ready', { matchId })}
            onCopy={copy}
            onShare={() => void share()}
            peers={peerPanel}
            reconnectRemaining={reconnectRemaining}
          />
        )}
        {!closed && (
          <Button
            variant="ghost"
            className="pvp-leave-action"
            disabled={disabled}
            onClick={() => setConfirmLeave(true)}
          >
            Keluar pertandingan
          </Button>
        )}
        {socket.error && (
          <p role="alert" className="pvp-command-error">
            {socket.error}
          </p>
        )}
        {socket.uncertain && (
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
        open={confirmLeave && !closed}
        onClose={() => setConfirmLeave(false)}
        title={snapshot.status === 'RUNNING' ? 'Menyerah dari duel?' : 'Keluar dari room?'}
        pending={socket.busy}
        description={
          snapshot.status === 'RUNNING'
            ? 'Keluar berarti menyerah. Hasil akhir ditetapkan server.'
            : 'Kamu akan keluar dari ruang tunggu. Perubahan room mengikuti server.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              disabled={socket.busy}
              onClick={() => setConfirmLeave(false)}
            >
              Tetap di sini
            </Button>
            <Button
              variant="danger"
              loading={socket.busy}
              disabled={disabled}
              onClick={() => {
                setConfirmLeave(false);
                void socket.command('room:leave', { matchId });
              }}
            >
              Ya, keluar
            </Button>
          </>
        }
      >
        <p>Pastikan sebelum melanjutkan.</p>
      </Dialog>
    </LearningFrame>
  );
}
