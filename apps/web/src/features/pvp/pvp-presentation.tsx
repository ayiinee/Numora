'use client';

import Link from 'next/link';
import { StudentMascot, type StudentMascotPose } from '@/components/student-mascot';
import { StudentIllustratedHero } from '@/features/core-learning/student-illustrated-hero';
import type { ReactNode } from 'react';
import { Avatar, Button, Card, Icon, Input } from '@tka/ui';
import { QuestionChoices } from '@/features/core-learning/question-choices';
import { MathText } from '@/features/core-learning/ui';
import type { PvpSnapshotDto, PvpPlayerDto } from '@/features/core-learning/generated-types';

export const difficultyLabels = { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' } as const;
// Approved PvP baseline, displayed only; server owns the actual question duration/score.
const durations = { easy: 30, medium: 45, hard: 60 } as const;
export type Difficulty = PvpSnapshotDto['difficulty'];

export function PvpHeader({
  title,
  connected,
  onLeave,
  showProfile = true,
}: {
  title: string;
  connected?: boolean | undefined;
  onLeave?: (() => void) | undefined;
  showProfile?: boolean;
}) {
  return (
    <header className="pvp-header">
      {onLeave ? (
        <Button
          variant="ghost"
          onClick={onLeave}
          leftIcon={<Icon name="back" width={16} height={16} />}
        >
          Keluar
        </Button>
      ) : (
        <Link className="pvp-header__back" href="/student/pvp" aria-label="Kembali ke PvP">
          <Icon name="back" width={18} height={18} />
          Kembali
        </Link>
      )}
      <h1>{title}</h1>
      {connected !== undefined && (
        <span className="pvp-header__connection">{connected ? 'Terhubung' : 'Offline'}</span>
      )}
      {showProfile && (
        <Link className="pvp-header__profile" href="/student/profile" aria-label="Buka profil">
          <Icon name="user" width={18} height={18} />
        </Link>
      )}
    </header>
  );
}

export function PvpHero() {
  return (
    <StudentIllustratedHero
      variant="pvp"
      titleId="pvp-hero-title"
      heading="h1"
      badges={
        <>
          <span>
            <Icon name="gamepad" width={14} height={14} />
            DUEL 1 VS 1
          </span>
          <span>
            <Icon name="clock" width={14} height={14} />
            10 Soal
          </span>
        </>
      }
      title="Tantang teman!"
      description={
        <>
          Jawab cepat dan tepat. Bonus hingga{' '}
          <span className="whitespace-nowrap">+50 poin/soal.</span>
        </>
      }
    />
  );
}

export function DifficultyChoices({
  value,
  onChange,
  disabled,
  availability,
  contentNotice,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  disabled: boolean;
  availability?: { difficulty: Difficulty; available: boolean }[] | undefined;
  contentNotice?: string | undefined;
}) {
  return (
    <fieldset className="pvp-difficulties" disabled={disabled}>
      <legend>Pilih tingkat kesulitan</legend>
      {(['easy', 'medium', 'hard'] as const).map((difficulty) => (
        <label
          key={difficulty}
          className={`pvp-difficulty pvp-difficulty--${difficulty}${value === difficulty ? ' is-selected' : ''}`}
        >
          <input
            type="radio"
            name="pvp-difficulty"
            value={difficulty}
            checked={value === difficulty}
            disabled={
              availability?.find((item) => item.difficulty === difficulty)?.available === false
            }
            onChange={() => onChange(difficulty)}
          />
          <span className="pvp-difficulty__icon">
            <Icon
              name={difficulty === 'easy' ? 'target' : difficulty === 'medium' ? 'spark' : 'trophy'}
            />
          </span>
          <span className="pvp-difficulty__body">
            <span>
              <strong>{difficultyLabels[difficulty]}</strong>
              <small>
                {availability?.find((item) => item.difficulty === difficulty)?.available === false
                  ? 'Belum tersedia'
                  : `${durations[difficulty]} dtk / soal`}
              </small>
            </span>
            <span>
              {contentNotice
                ? 'Soal dari bank sementara'
                : `Duel matematika tingkat ${difficultyLabels[difficulty].toLowerCase()}`}
            </span>
          </span>
          <span className="pvp-difficulty__selected" aria-hidden="true">
            {value === difficulty && <Icon name="check" width={16} height={16} />}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function JoinRoomForm({
  code,
  onChange,
  disabled,
  busy,
  onJoin,
}: {
  code: string;
  onChange: (code: string) => void;
  disabled: boolean;
  busy: boolean;
  onJoin: () => void;
}) {
  return (
    <Card className="pvp-join-card">
      <div className="pvp-card-heading">
        <span className="icon-tile">
          <Icon name="lock" />
        </span>
        <div>
          <h2>Punya Kode Duel dari Teman?</h2>
          <p>Gabung ke lobi temanmu yang sudah dibuat.</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onJoin();
        }}
      >
        <Input
          id="pvp-room-code"
          label="Kode room"
          value={code}
          maxLength={12}
          pattern="[A-Za-z0-9]{12}"
          required
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          placeholder="Masukkan kode 12 karakter…"
        />
        <Button loading={busy} disabled={disabled || !code.trim()} type="submit">
          Gabung room
        </Button>
      </form>
      <p className="pvp-small-note">
        Gunakan kode 12 karakter atau buka link/QR yang dibagikan teman melalui kamera perangkat.
      </p>
    </Card>
  );
}

export function PvpRules() {
  return (
    <Card className="pvp-rules">
      <details open>
        <summary>
          <Icon name="info" />
          Aturan Duel
          <Icon name="chevron" width={18} height={18} />
        </summary>

        <ul>
          <li>
            <Icon name="check" />
            <span>
              <strong>Soal Sama:</strong> 10 soal identik untuk kedua pemain.
            </span>
          </li>

          <li>
            <Icon name="clock" />
            <span>
              <strong>Poin:</strong> Benar +100, bonus cepat hingga +50.
            </span>
          </li>

          <li>
            <Icon name="trophy" />
            <span>
              <strong>Peringkat:</strong> Skor terbaik masuk leaderboard PvP.
            </span>
          </li>

          <li>
            <Icon name="lock" />
            <span>
              <strong>Terkunci:</strong> Jawaban tidak bisa diubah setelah dikirim.
            </span>
          </li>
        </ul>
      </details>
    </Card>
  );
}

export function PlayerCard({
  player,
  selfId,
  creatorId,
  closed,
  reconnectRemaining,
}: {
  player: PvpPlayerDto;
  selfId?: string | undefined;
  creatorId?: string;
  closed?: boolean;
  reconnectRemaining?: number | undefined;
}) {
  return (
    <article
      className={`pvp-player-card${player.studentId === selfId ? ' is-self' : ''}${player.ready && player.connectionStatus !== 'DISCONNECTED' ? ' is-ready' : ''}`}
    >
      {player.studentId === creatorId && <span className="pvp-player-card__host">Tuan Rumah</span>}
      <Avatar name={player.displayName} size="lg" />
      <h2>
        {player.displayName}
        {player.studentId === selfId && <small>KAMU</small>}
      </h2>
      {closed ? (
        <strong className="pvp-player-card__points">
          {player.points.toLocaleString('id-ID')} <small>PTS</small>
        </strong>
      ) : (
        <p className="pvp-player-card__status">
          {player.connectionStatus === 'DISCONNECTED'
            ? 'Koneksi terputus'
            : player.ready
              ? 'Siap Tanding'
              : 'Belum siap'}
        </p>
      )}
      {player.result && (
        <p>
          {player.result === 'WIN'
            ? 'Menang'
            : player.result === 'DRAW'
              ? 'Seri'
              : player.result === 'LOSS' || player.result === 'FORFEIT'
                ? 'Kalah'
                : 'Selesai bermain'}
        </p>
      )}
      {!closed && player.connectionStatus === 'DISCONNECTED' && player.reconnectDeadlineAt && (
        <p role="timer" aria-label={`Waktu reconnect ${player.displayName}`}>
          Menyambungkan kembali · {reconnectRemaining ?? '—'} detik
        </p>
      )}
    </article>
  );
}

export function WaitingRoom({
  snapshot,
  selfId,
  qr,
  qrError,
  link,
  disabled,
  onReady,
  onCopy,
  onShare,
  peers,
  reconnectRemaining,
  roomRemaining,
}: {
  snapshot: PvpSnapshotDto;
  selfId?: string | undefined;
  qr: string;
  qrError: boolean;
  link: string;
  disabled: boolean;
  onReady: () => void;
  onCopy: (value: string, label: string) => void;
  onShare: () => void;
  peers?: ReactNode;
  reconnectRemaining: Record<string, number>;
  roomRemaining?: number | undefined;
}) {
  const self = snapshot.players.find((player) => player.studentId === selfId);
  const opponent = snapshot.players.find((player) => player.studentId !== selfId);
  let instruction = 'Tekan Saya siap. Duel dimulai setelah kalian berdua siap.';
  if (!opponent) {
    instruction = self?.ready
      ? 'Kamu sudah siap. Ajak teman bergabung untuk memulai duel.'
      : 'Kamu bisa menekan Siap sambil menunggu teman bergabung.';
  } else if (opponent.connectionStatus === 'DISCONNECTED') {
    instruction = 'Lawan sedang menyambungkan kembali. Tunggu sebentar.';
  } else if (self?.ready) {
    instruction = opponent.ready
      ? 'Kalian sudah siap. Duel akan segera dimulai.'
      : `Menunggu ${opponent.displayName} menekan Siap.`;
  } else if (opponent.ready) {
    instruction = 'Lawan sudah siap. Tekan Saya siap untuk memulai duel.';
  }
  return (
    <div className="pvp-waiting-layout">
      <Card className="pvp-waiting-status" aria-label="Kesiapan duel">
        <div className="pvp-waiting-status__heading">
          <div>
            <p>{difficultyLabels[snapshot.difficulty]} · 10 soal</p>
            <h2>{opponent ? 'Lawan sudah bergabung' : 'Menunggu lawan'}</h2>
          </div>
          {roomRemaining !== undefined && (
            <div className="pvp-room-timer">
              <span>Sisa waktu room</span>
              <strong role="timer" aria-label="Sisa waktu room" aria-live="off">
                <Icon name="clock" width={16} height={16} />
                {String(Math.floor(roomRemaining / 60)).padStart(2, '0')}:
                {String(roomRemaining % 60).padStart(2, '0')}
              </strong>
            </div>
          )}
        </div>
        <div className="pvp-player-grid">
          {snapshot.players.map((player) => (
            <PlayerCard
              key={player.studentId}
              player={player}
              selfId={selfId}
              creatorId={snapshot.creatorStudentId}
              reconnectRemaining={reconnectRemaining[player.studentId]}
            />
          ))}
          {!opponent && (
            <article className="pvp-player-card pvp-player-card--vacant">
              <StudentMascot pose="opponent" compact />
              <h2>Lawan belum bergabung</h2>
              <p>Bagikan kode room di bawah.</p>
            </article>
          )}
        </div>
        <p className="pvp-waiting-instruction" role="status">
          {instruction}
        </p>
        <Button
          fullWidth
          disabled={disabled || !self || self.ready}
          onClick={onReady}
          leftIcon={<Icon name={self?.ready ? 'check' : 'gamepad'} />}
        >
          {self?.ready ? 'Kamu sudah siap' : 'Saya siap'}
        </Button>
      </Card>
      <aside className="pvp-waiting-context">
        <Card className="pvp-room-code">
          <h2>Ajak teman bergabung</h2>
          <p>Kirim kode atau link room ke temanmu.</p>
          <div className="pvp-room-code__copy">
            <strong className="pvp-room-code__value">{snapshot.roomCode}</strong>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onCopy(snapshot.roomCode, 'Kode')}
              leftIcon={<Icon name="clipboard" width={16} height={16} />}
            >
              Salin
            </Button>
          </div>
          {!qr && (
            <p role="status">
              {qrError ? 'QR belum tersedia. Gunakan kode atau link room.' : 'Menyiapkan QR…'}
            </p>
          )}
          <Button
            fullWidth
            variant="secondary"
            onClick={onShare}
            leftIcon={<Icon name="arrow" width={16} height={16} />}
          >
            Bagikan Link Duel
          </Button>
          {qr && (
            <details className="pvp-room-qr">
              <summary>
                Tampilkan QR room
                <Icon name="chevron" width={16} height={16} />
              </summary>
              <img src={qr} width={192} height={192} alt="QR link gabung room" />
              <p>Minta temanmu memindai QR untuk bergabung.</p>
            </details>
          )}
          <details open={qrError || undefined}>
            <summary>
              Link room
              <Icon name="chevron" width={16} height={16} />
            </summary>
            <a href={link}>{link}</a>
            <Button variant="ghost" onClick={() => onCopy(link, 'Link')}>
              Salin link
            </Button>
          </details>
        </Card>
        {peers && (
          <details className="pvp-waiting-invites">
            <summary>
              <Icon name="users" width={16} height={16} />
              Undang teman sekelas
            </summary>
            {peers}
          </details>
        )}
      </aside>
    </div>
  );
}

export function BattleRoom({
  snapshot,
  selfId,
  remaining,
  selected,
  disabled,
  onSelect,
  onAnswer,
  onLeave,
  reconnectRemaining,
}: {
  snapshot: PvpSnapshotDto;
  selfId?: string | undefined;
  remaining: number;
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAnswer: () => void;
  onLeave: () => void;
  reconnectRemaining: Record<string, number>;
}) {
  const question = snapshot.question;
  if (!question) return null;
  const self = snapshot.players.find((player) => player.studentId === selfId);
  const opponent = snapshot.players.find((player) => player.studentId !== selfId);
  return (
    <div className="pvp-battle-layout">
      <div className="pvp-battle-main">
        <div className="pvp-round-bar">
          <span>Ronde {question.order}/10</span>
          <span>
            <Icon name="clock" width={14} height={14} />
            {difficultyLabels[snapshot.difficulty]} ({question.durationSeconds}s)
          </span>
          <Button variant="danger-outline" size="sm" onClick={onLeave}>
            Menyerah
          </Button>
        </div>
        <Card className="pvp-scoreboard" aria-label="Skor pertandingan">
          <div className="pvp-scoreboard__player">
            {self && (
              <>
                <Avatar name={self.displayName} />
                <strong>
                  {self.displayName} <small>KAMU</small>
                </strong>
                <b>
                  {self.points.toLocaleString('id-ID')} <small>PTS</small>
                </b>
                <span>{question.answered ? 'Jawaban terkunci' : 'Memilih jawaban'}</span>
              </>
            )}
          </div>
          <span className="pvp-scoreboard__versus" aria-hidden="true">
            VS
          </span>
          <div className="pvp-scoreboard__player">
            {opponent && (
              <>
                <Avatar name={opponent.displayName} />
                <strong>{opponent.displayName}</strong>
                <b>
                  {opponent.points.toLocaleString('id-ID')} <small>PTS</small>
                </b>
                <span>
                  {opponent.connectionStatus === 'DISCONNECTED'
                    ? 'Koneksi terputus'
                    : 'Lawan bermain'}
                </span>
              </>
            )}
          </div>
        </Card>
        <div className="pvp-round-timer">
          <div className="pvp-round-timer__track" aria-hidden="true">
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (remaining / question.durationSeconds) * 100))}%`,
              }}
            />
          </div>
          <span>
            <Icon name="clock" width={14} height={14} />
            <span role="timer" aria-label="Sisa waktu">
              {remaining}
            </span>
            detik
          </span>
        </div>
        <Card className="pvp-question">
          <div>
            <span>Soal {question.order} dari 10</span>
            <span>100 + Kecepatan (hingga +50 PTS)</span>
          </div>
          <h2>
            <MathText value={question.stem} />
          </h2>
        </Card>
        <div className="pvp-answer-list">
          <QuestionChoices
            kind="SINGLE_CHOICE"
            name="pvp-answer"
            options={question.options}
            value={selected}
            disabled={disabled}
            onChange={(value) => onSelect(value as string)}
            selectedHint={
              question.answered ? 'Jawaban Kamu • Terkunci' : 'Jawaban dipilih • Belum dikirim'
            }
          />
          <Button fullWidth disabled={disabled || selected === null} onClick={onAnswer}>
            Kunci jawaban
          </Button>
        </div>
      </div>
      <aside className="pvp-battle-context">
        <Card className="pvp-lock-note">
          <Icon name="lock" />
          <p role={question.answered ? 'status' : undefined}>
            {question.answered
              ? 'Jawaban terkunci. Menunggu soal berikutnya dari server.'
              : 'Pilihan belum terkunci sampai jawaban dikirim dan diterima server.'}{' '}
            Kunci jawaban tidak ditampilkan selama duel.
          </p>
        </Card>
        <Card className="pvp-round-progress">
          <h2>Lini Masa Duel (10 Ronde)</h2>
          <ol>
            {Array.from({ length: 10 }, (_, index) => (
              <li
                key={index}
                className={
                  index + 1 === question.order
                    ? 'is-active'
                    : index + 1 < question.order
                      ? 'is-past'
                      : ''
                }
                aria-current={index + 1 === question.order ? 'step' : undefined}
              >
                {index + 1}
              </li>
            ))}
          </ol>
          <p>Ronde sebelumnya telah berlalu. Rekap benar/salah belum tersedia pada snapshot.</p>
        </Card>
        {snapshot.players
          .filter(
            (player) => player.connectionStatus === 'DISCONNECTED' && player.reconnectDeadlineAt,
          )
          .map((player) => (
            <Card key={player.studentId}>
              <p role="timer" aria-label={`Waktu reconnect ${player.displayName}`}>
                {player.displayName}: {reconnectRemaining[player.studentId] ?? '—'} detik untuk
                tersambung kembali. Keputusan akhir mengikuti server.
              </p>
            </Card>
          ))}
      </aside>
    </div>
  );
}

function outcomePose(status: PvpSnapshotDto['status'], result?: string | null): StudentMascotPose {
  if (status === 'CANCELLED') return 'cancelled';
  switch (result) {
    case 'WIN':
      return 'victory';
    case 'DRAW':
      return 'draw';
    case 'LOSS':
    case 'FORFEIT':
      return 'retry';
    default:
      return 'submitted';
  }
}

export function MatchOutcome({
  snapshot,
  selfId,
}: {
  snapshot: PvpSnapshotDto;
  selfId?: string | undefined;
}) {
  const self = snapshot.players.find((player) => player.studentId === selfId);
  const cancelled = snapshot.status === 'CANCELLED';
  const lost = self?.result === 'LOSS' || self?.result === 'FORFEIT';
  let title = 'Duel selesai';
  let description = 'Lihat poin akhir kedua pemain di bawah.';
  if (cancelled) {
    title = snapshot.endReason === 'ROOM_EXPIRED' ? 'Waktu tunggu habis' : 'Duel dibatalkan';
    description = 'Buat room baru untuk bermain lagi.';
  } else if (self?.result === 'WIN') {
    title = 'Kamu menang!';
    description =
      snapshot.endReason === 'FORFEIT'
        ? 'Lawan keluar atau tidak tersambung kembali. Kamu menang pada duel ini.'
        : 'Kerja bagus! Tantang temanmu lagi di duel berikutnya.';
  } else if (lost) {
    title = 'Kamu kalah kali ini';
    description =
      self?.result === 'FORFEIT'
        ? 'Duel berakhir karena kamu keluar atau tidak tersambung kembali.'
        : 'Tetap semangat. Latihan lagi, lalu coba duel berikutnya.';
  } else if (self?.result === 'DRAW') {
    title = 'Duel berakhir seri';
    description = 'Poin kalian sama. Siap mencoba duel lagi?';
  }
  return (
    <div className="pvp-outcome-layout">
      <Card className="pvp-outcome-hero">
        <StudentMascot pose={outcomePose(snapshot.status, self?.result)} />
        <span className="pvp-outcome-state">
          {difficultyLabels[snapshot.difficulty]} · Duel 1 vs 1
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="pvp-player-grid">
          {snapshot.players.map((player) => (
            <PlayerCard key={player.studentId} player={player} selfId={selfId} closed />
          ))}
        </div>
        {!snapshot.recordEligible && (
          <p className="pvp-outcome-note">Pertandingan ini tidak berkontribusi pada leaderboard.</p>
        )}
      </Card>
      <aside className="pvp-outcome-actions">
        <Link className="button-link" href="/student/pvp">
          <Icon name="gamepad" />
          Main lagi
        </Link>
        <Link
          className="button-link pvp-secondary-link"
          href={`/student/leaderboards?difficulty=${snapshot.difficulty}`}
        >
          <Icon name="trophy" />
          Lihat Leaderboard PvP
        </Link>
      </aside>
    </div>
  );
}
