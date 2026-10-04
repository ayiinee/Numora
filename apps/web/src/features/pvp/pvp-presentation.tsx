'use client';

import Link from 'next/link';
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
}: {
  title: string;
  connected?: boolean | undefined;
  onLeave?: (() => void) | undefined;
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
      <Link className="pvp-header__profile" href="/student/profile" aria-label="Buka profil">
        <Icon name="user" width={18} height={18} />
      </Link>
    </header>
  );
}

export function PvpHero() {
  return (
    <section className="pvp-hero" aria-labelledby="pvp-hero-title">
      <div className="pvp-hero__badges">
        <span>
          <Icon name="gamepad" width={14} height={14} />
          LIVE PVP BATTLE
        </span>
        <span>
          <Icon name="clock" width={14} height={14} />
          10 Soal
        </span>
      </div>
      <h1 id="pvp-hero-title">Tantang Teman &amp; Buktikan Kecepatanmu!</h1>
      <p>Jawab cepat dan tepat. Skor kecepatan hingga +50 poin per soal!</p>
      <span className="pvp-hero__art" aria-hidden="true">
        <Icon name="gamepad" width={52} height={52} />
      </span>
    </section>
  );
}

export function DifficultyChoices({
  value,
  onChange,
  disabled,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="pvp-difficulties" disabled={disabled}>
      <legend>
        Pilih Tingkat Kesulitan <small>10 Soal • Poin PvP</small>
      </legend>
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
              <small>{durations[difficulty]} dtk / soal</small>
            </span>
            <span>Duel matematika tingkat {difficultyLabels[difficulty].toLowerCase()}</span>
            <span className="pvp-difficulty__points">
              100 Poin Dasar <span>Bonus s.d +50 Poin</span>
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
          Aturan &amp; Ketentuan Duel Matematika
          <Icon name="chevron" width={18} height={18} />
        </summary>
        <ul>
          <li>
            <Icon name="check" />
            <span>
              <strong>Soal Sinkron &amp; Adil:</strong> Kedua pemain menerima 10 soal dan urutan
              yang identik dari server Numora.
            </span>
          </li>
          <li>
            <Icon name="clock" />
            <span>
              <strong>Kalkulasi Kecepatan:</strong> Jawaban benar mendapat 100 poin dasar dan bonus
              hingga 50 poin. Jawaban salah atau kosong bernilai 0.
            </span>
          </li>
          <li>
            <Icon name="trophy" />
            <span>
              <strong>Peringkat PvP:</strong> Rekor poin terbaik dicatat pada leaderboard global
              PvP, terpisah dari XP kelas. Pertandingan forfeit atau dibatalkan tidak memperbarui
              rekor.
            </span>
          </li>
          <li>
            <Icon name="lock" />
            <span>
              <strong>Jawaban Terkunci:</strong> Setelah dikirim dan diterima server, jawaban tidak
              dapat diganti. Waktu terus berjalan saat koneksi terputus; kesempatan reconnect 20
              detik.
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
    <article className={`pvp-player-card${player.studentId === selfId ? ' is-self' : ''}`}>
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
              : 'Selesai bermain'}
        </p>
      )}
      {!closed && player.connectionStatus === 'DISCONNECTED' && player.reconnectDeadlineAt && (
        <p role="timer" aria-label={`Waktu reconnect ${player.displayName}`}>
          {reconnectRemaining ?? '—'} detik untuk tersambung kembali. Keputusan akhir mengikuti
          server.
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
}) {
  const self = snapshot.players.find((player) => player.studentId === selfId);
  return (
    <div className="pvp-waiting-layout">
      <div className="pvp-waiting-main">
        <div className="pvp-room-meta">
          <strong>
            {snapshot.players.length < 2 ? 'Menunggu Lawan Bergabung…' : 'Menunggu Kesiapan Pemain'}
          </strong>
          <div>
            <span>
              <Icon name="clock" width={14} height={14} />
              {difficultyLabels[snapshot.difficulty]}
            </span>
            <span>10 Soal Acak Campuran</span>
            <span>
              <Icon name="gamepad" width={14} height={14} />
              Mode 1 vs 1
            </span>
          </div>
        </div>
        <Card className="pvp-room-code">
          <div className="pvp-room-code__label">
            <span>KODE AKSES DUEL</span>
            <span>
              <Icon name="users" width={14} height={14} />
              Bagikan ke teman
            </span>
          </div>
          <div className="pvp-room-code__copy">
            <h2>Room {snapshot.roomCode}</h2>
            <Button
              size="sm"
              onClick={() => onCopy(snapshot.roomCode, 'Kode')}
              leftIcon={<Icon name="clipboard" width={16} height={16} />}
            >
              Salin
            </Button>
          </div>
          {qr ? (
            <img src={qr} width={192} height={192} alt="QR link gabung room" />
          ) : (
            <p role="status">
              {qrError ? 'QR belum tersedia. Gunakan kode atau link room.' : 'Menyiapkan QR…'}
            </p>
          )}
          <h3>Scan untuk Masuk Cepat</h3>
          <p>Arahkan kamera smartphone temanmu ke QR ini.</p>
          <Button
            variant="secondary"
            onClick={onShare}
            leftIcon={<Icon name="arrow" width={16} height={16} />}
          >
            Bagikan Link Duel
          </Button>
          <details>
            <summary>Link room</summary>
            <a href={link}>{link}</a>
            <Button variant="ghost" onClick={() => onCopy(link, 'Link')}>
              Salin link
            </Button>
          </details>
        </Card>
        <div className="pvp-players-heading">
          <h2>Pemain di Arena ({snapshot.players.length}/2)</h2>
          <span>
            {snapshot.players.length < 2 ? 'Membutuhkan 1 lawan' : 'Dua pemain bergabung'}
          </span>
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
          {snapshot.players.length < 2 && (
            <article className="pvp-player-card pvp-player-card--vacant">
              <span className="icon-tile">
                <Icon name="users" />
              </span>
              <h2>Mencari Lawan…</h2>
              <p>Bagikan kode atau link room.</p>
            </article>
          )}
        </div>
      </div>
      <aside className="pvp-waiting-context">
        {peers}
        <Card className="pvp-room-guidance">
          <Icon name="info" />
          <p>
            Kedua pemain perlu menyatakan siap. Duel dimulai sesuai state server setelah kesiapan
            keduanya diterima.
          </p>
        </Card>
        <Button
          fullWidth
          disabled={disabled || !self || self.ready}
          onClick={onReady}
          leftIcon={<Icon name="gamepad" />}
        >
          {self?.ready ? 'Menunggu pemain lain' : 'Saya siap'}
        </Button>
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
          <div className="pvp-scoreboard__timer">
            <span role="timer" aria-label="Sisa waktu">
              {remaining}
            </span>
            <small>DETIK</small>
            <span>VS</span>
          </div>
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

export function MatchOutcome({
  snapshot,
  selfId,
}: {
  snapshot: PvpSnapshotDto;
  selfId?: string | undefined;
}) {
  const self = snapshot.players.find((player) => player.studentId === selfId);
  const title =
    snapshot.status === 'CANCELLED'
      ? 'Pertandingan dibatalkan'
      : snapshot.endReason === 'FORFEIT'
        ? 'Duel berakhir karena menyerah'
        : self?.result === 'WIN'
          ? 'Kemenangan!'
          : self?.result === 'DRAW'
            ? 'Hasil seri'
            : 'Duel selesai';
  return (
    <div className="pvp-outcome-layout">
      <Card className="pvp-outcome-hero">
        <span className="pvp-outcome-trophy">
          <Icon name="trophy" width={40} height={40} />
        </span>
        <span className="pvp-outcome-state">
          {snapshot.status === 'CANCELLED' ? 'DIBATALKAN' : 'PVP • SELESAI'}
        </span>
        <h2>{title}</h2>
        <p>Duel Matematika TKA SMP • Tingkat {difficultyLabels[snapshot.difficulty]}</p>
        <div className="pvp-player-grid">
          {snapshot.players.map((player) => (
            <PlayerCard key={player.studentId} player={player} selfId={selfId} closed />
          ))}
        </div>
      </Card>
      <aside>
        <Card className="pvp-outcome-record">
          <h2>
            <Icon name="chart" />
            Poin &amp; Rekor
          </h2>
          <p>
            {snapshot.recordEligible
              ? 'Rekor akan diperbarui oleh proyeksi leaderboard.'
              : 'Pertandingan ini tidak berkontribusi pada leaderboard.'}
          </p>
          <div>
            <Icon name="info" />
            <p>Poin pertandingan dan XP kelas terpisah. PvP tidak masuk leaderboard kelas.</p>
          </div>
        </Card>
        <Link
          className="button-link"
          href={`/student/leaderboards?difficulty=${snapshot.difficulty}`}
        >
          <Icon name="trophy" />
          Lihat Leaderboard PvP
        </Link>
        <Link className="button-link pvp-secondary-link" href="/student/pvp">
          <Icon name="back" />
          Kembali ke PvP
        </Link>
      </aside>
    </div>
  );
}
