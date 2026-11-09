'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon } from '@tka/ui';
import { learningApi, request } from './api';
import type { LeaderboardDto, LeaderboardPeriodsDto } from './generated-types';
import { useStudentToken } from './student-session';
import { DataState, LearningFrame, Status } from './ui';
import {
  LeaderboardPodium,
  LeaderboardRankingList,
  formatLeaderboardPoints,
  hasLeaderboardPodiumTie,
} from './leaderboard-podium';
import { StudentIllustratedHero } from './student-illustrated-hero';
import { difficultyLabels, PvpHeader, type Difficulty } from '@/features/pvp/pvp-presentation';
import './leaderboards.css';

const themes = {
  easy: {
    title: 'Podium Juara Rookie',
    seconds: 30,
  },
  medium: {
    title: 'Podium Juara Minggu Ini',
    seconds: 45,
  },
  hard: {
    title: 'Top 3 Master',
    seconds: 60,
  },
} as const;
const periodDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));

export function LeaderboardsScreen() {
  const token = useStudentToken();
  const [tab, setTab] = useState<'pvp' | 'class' | 'activity'>('pvp');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [classId, setClassId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const dashboard = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => learningApi.dashboard(token),
  });
  const selectedClass =
    classId || dashboard.data?.classes?.[0]?.id || dashboard.data?.class?.id || '';
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'class') setTab('class');
    if (params.get('tab') === 'activity') setTab('activity');
    const selected = params.get('difficulty');
    if (selected === 'easy' || selected === 'medium' || selected === 'hard')
      setDifficulty(selected);
  }, []);
  const params = new URLSearchParams();
  if (tab === 'pvp') params.set('difficulty', difficulty);
  if (tab === 'class' && selectedClass) params.set('classId', selectedClass);
  const periodsParams = new URLSearchParams({
    ...Object.fromEntries(params),
    scope: tab,
  }).toString();
  const periods = useQuery({
    queryKey: ['leaderboard-periods', tab, difficulty, selectedClass],
    queryFn: () => request<LeaderboardPeriodsDto>(token, `/leaderboards/periods?${periodsParams}`),
    enabled: tab !== 'class' || !!selectedClass,
  });
  if (periodId) params.set('periodId', periodId);
  const query = useQuery({
    queryKey: ['student-leaderboard', tab, difficulty, selectedClass, periodId],
    queryFn: () => request<LeaderboardDto>(token, `/leaderboards/${tab}?${params}`),
  });
  return (
    <LearningFrame
      title="Leaderboard"
      className={`pvp-ranking-shell${tab === 'pvp' ? ` pvp-ranking-shell--${difficulty} pvp-ranking-shell--compact` : ''}`}
    >
      <PvpHeader
        showProfile={false}
        title={
          tab === 'class'
            ? 'Leaderboard Kelas'
            : tab === 'activity'
              ? 'Leaderboard Aktivitas'
              : 'Leaderboard PvP'
        }
      />
      <div className="pvp-ranking-content">
        <div className="pvp-ranking-filters">
          <div className="pvp-ranking-scope" role="group" aria-label="Jenis peringkat">
            <button
              aria-pressed={tab === 'pvp'}
              onClick={() => {
                setTab('pvp');
                setPeriodId('');
              }}
            >
              Global PvP
            </button>
            <button
              aria-pressed={tab === 'class'}
              onClick={() => {
                setTab('class');
                setPeriodId('');
              }}
            >
              Kelas
            </button>
            <button
              aria-pressed={tab === 'activity'}
              onClick={() => {
                setTab('activity');
                setPeriodId('');
              }}
            >
              Aktivitas Global
            </button>
          </div>
          {tab === 'class' && !!dashboard.data?.classes?.length && (
            <label>
              Kelas
              <select
                aria-label="Kelas leaderboard"
                value={selectedClass}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setPeriodId('');
                }}
              >
                {dashboard.data.classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Periode
            <select
              aria-label="Periode leaderboard"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              disabled={periods.isPending}
            >
              <option value="">Minggu berjalan</option>
              {periods.data?.periods
                .filter((p) => p.status === 'ARCHIVED' && p.id)
                .map((p) => (
                  <option key={p.id} value={p.id!}>
                    {periodDate(p.startsAt)} –{' '}
                    {periodDate(new Date(Date.parse(p.endsAt) - 1).toISOString())} WIB
                  </option>
                ))}
            </select>
          </label>
        </div>
        {periods.isError && (
          <Status title="Arsip belum dapat dimuat">
            <Button variant="secondary" onClick={() => void periods.refetch()}>
              Coba muat arsip lagi
            </Button>
          </Status>
        )}
        {tab === 'pvp' && (
          <div className="pvp-ranking-tabs" role="group" aria-label="Kesulitan PvP">
            {(['easy', 'medium', 'hard'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={difficulty === value}
                onClick={() => {
                  setDifficulty(value);
                  setPeriodId('');
                }}
              >
                {difficultyLabels[value]}
              </button>
            ))}
          </div>
        )}
        {tab === 'pvp' && (
          <StudentIllustratedHero
            variant="leaderboard"
            difficulty={difficulty}
            titleId="leaderboard-hero-title"
            badges={
              <>
                <span>
                  <Icon name="trophy" width={14} height={14} />
                  PVP
                </span>
                <span>
                  <Icon name="clock" width={14} height={14} />
                  {themes[difficulty].seconds}s / Soal
                </span>
              </>
            }
            title={`Peringkat arena ${difficultyLabels[difficulty].toLowerCase()}`}
            description="Rekor poin terbaik dari duelmu minggu ini."
          />
        )}
        {query.isPending || query.isError ? (
          <DataState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          />
        ) : (
          <RankingData
            data={query.data}
            tab={tab}
            difficulty={difficulty}
            fetching={query.isFetching}
            onRefresh={() => void query.refetch()}
          />
        )}
      </div>
    </LearningFrame>
  );
}

function RankingData({
  data,
  tab,
  difficulty,
  fetching,
  onRefresh,
}: {
  data: LeaderboardDto;
  tab: 'pvp' | 'class' | 'activity';
  difficulty: Difficulty;
  fetching: boolean;
  onRefresh: () => void;
}) {
  const own = data.ownEntry;
  const unit = data.unit === 'xp' ? 'XP' : 'PTS';
  const tied = hasLeaderboardPodiumTie(data.entries);
  const podiumEntries = tied ? [] : data.entries.filter((entry) => entry.rank <= 3);
  const listEntries = tied ? data.entries : data.entries.filter((entry) => entry.rank > 3);
  const podiumLabel =
    tab === 'class'
      ? 'Podium teratas kelas'
      : tab === 'activity'
        ? 'Peringkat Aktivitas Global'
        : 'Podium Global PvP';
  return (
    <>
      {data.policyPending && (
        <Status title="Peringkat belum tersedia">
          {tab === 'class'
            ? 'Aturan XP kelas sedang ditetapkan. XP PvP tidak masuk peringkat kelas.'
            : 'Pertandingan PvP belum dibuka. Rekor akan tampil setelah fitur tersedia.'}
        </Status>
      )}

      {data.available === false && !data.policyPending && (
        <Status title="Menunggu pembaruan peringkat">
          Proyeksi periode ini belum tersedia. Coba perbarui setelah worker selesai.
        </Status>
      )}
      {data.stale && data.updatedAt && (
        <Status title="Data belum diperbarui">
          Peringkat menampilkan pembaruan terakhir yang berhasil.
        </Status>
      )}
      {data.rankPolicyVersion?.startsWith('legacy') && (
        <Status title="Arsip kebijakan lama">
          Peringkat arsip dipertahankan sesuai aturan saat periode tersebut ditutup.
        </Status>
      )}
      <div className="pvp-ranking-layout">
        <Card className="pvp-ranking-main pvp-ranking-podium student-scoreboard">
          <div className="student-scoreboard__stage">
            <div className="pvp-ranking-section-heading">
              <h2>
                <Icon name="trophy" width={20} height={20} />
                {tab === 'class'
                  ? (data.className ?? 'Podium Kelas')
                  : tab === 'activity'
                    ? 'Aktivitas Global'
                    : themes[difficulty].title}
              </h2>
              <span>
                {periodDate(data.period.startsAt)} –{' '}
                {periodDate(new Date(Date.parse(data.period.endsAt) - 1).toISOString())} WIB
              </span>
            </div>
            {data.policyPending ? (
              <p>Peringkat final menunggu persetujuan aturan.</p>
            ) : data.entries.length ? (
              podiumEntries.length > 0 && (
                <LeaderboardPodium
                  entries={podiumEntries}
                  ownEntry={own}
                  unit={data.unit}
                  label={podiumLabel}
                />
              )
            ) : (
              <EmptyState
                icon={<Icon name="trophy" />}
                title="Belum ada rekor pada periode ini."
                description="Rekor akan tampil setelah data pertandingan atau kelas tersedia."
              />
            )}
          </div>
          {!data.policyPending && listEntries.length > 0 && (
            <section className="pvp-ranking-list">
              <div className="pvp-ranking-section-heading">
                <h2>
                  {tab === 'class'
                    ? 'Peringkat Kelas'
                    : tab === 'activity'
                      ? 'Peringkat Aktivitas Global'
                      : 'Papan Peringkat PvP'}
                </h2>
                <span>{tab === 'pvp' ? 'Top 10 • Poin terbaik' : 'Top 10 • XP aktivitas'}</span>
              </div>
              <LeaderboardRankingList
                entries={listEntries}
                ownEntry={own}
                unit={data.unit}
                label={tied ? podiumLabel : 'Peringkat berikutnya'}
              />
            </section>
          )}
        </Card>
        <aside className="pvp-ranking-context">
          <Card className="pvp-own-rank">
            <h2>Posisimu</h2>
            {data.policyPending ? (
              <p>Posisimu tersedia setelah peringkat dibuka.</p>
            ) : own ? (
              <>
                <div className="pvp-own-rank__summary">
                  <span className="pvp-own-rank__position">#{own.rank}</span>
                  <div>
                    <strong>{own.displayName ?? 'Kamu'}</strong>
                    <small>KAMU</small>
                  </div>
                  <span className="pvp-rank-points">
                    <strong>{formatLeaderboardPoints(own.points, data.unit)}</strong>
                    <small>{unit}</small>
                  </span>
                </div>
                {tab === 'pvp' && (
                  <Link className="button-link" href="/student/pvp">
                    <Icon name="gamepad" width={18} height={18} />
                    Cari Lawan Duel
                  </Link>
                )}
              </>
            ) : (
              <p>Belum memiliki rekor pada periode ini.</p>
            )}
          </Card>
          <Card className="pvp-ranking-period">
            <h2>
              <Icon name="clock" width={18} height={18} />
              Periode Mingguan
            </h2>
            <p>
              {data.period.status === 'ARCHIVED'
                ? 'Arsip periode ini sudah ditutup.'
                : 'Reset setelah Rabu 23:59 WIB. Peringkat diperbarui setiap jam.'}
            </p>
            {tab === 'pvp' && (
              <p>Jawaban benar +100 poin, dengan bonus kecepatan hingga +50 poin per soal.</p>
            )}
            <p>
              {data.updatedAt
                ? `Diperbarui ${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.updatedAt))} WIB`
                : 'Menunggu pembaruan peringkat.'}
            </p>
            <Button fullWidth variant="secondary" disabled={fetching} onClick={onRefresh}>
              {fetching ? 'Memperbarui…' : 'Perbarui peringkat'}
            </Button>
          </Card>
        </aside>
      </div>
    </>
  );
}
