import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressBar } from '@tka/ui';
import { AppShell } from '@/components/shell';
import { StudentAccess } from './student-session';
import { NewStudentDashboard } from './dashboard-new';
import { ProfileScreen } from './profile';
import { TryoutScreen } from './tryout';
import { TryoutWaiting, TryoutReleasedResult } from './tryout-presentation';
import { SubchapterScreen } from './catalog';
import { AssessmentScreen } from './assessment-history';
import { TeacherDashboardScreen } from '@/features/monitoring/teacher-screens';
import { TeacherProfileScreen } from '@/features/onboarding/teacher-profile';
import { learningApi, request } from './api';
import { FeedbackOverview } from './feedback-overview';
import { LeaderboardsScreen } from './leaderboards';
import { HomeClassPodium } from './home-class-podium';
import { HomeActivity, HomeTryoutHero } from './dashboard-presentation';
import { getTeacherClasses, joinClass } from '@/lib/api';
import { destination } from '@/features/onboarding/destination';

// Fictional fixtures stay in tests; live screens never synthesize learning data.
const context = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  pathname: '/student',
  levelFilter: '',
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => context.pathname,
  useRouter: () => ({ replace: context.replace, push: context.push }),
  useParams: () => ({ chapterId: 'chapter-test', subchapterId: 'sub-test' }),
  useSearchParams: () =>
    new URLSearchParams(context.levelFilter ? { levelId: context.levelFilter } : {}),
}));
vi.mock('@/features/onboarding/auth', () => ({
  useAuth: () => ({ state: context.state, refresh: context.refresh, logout: context.logout }),
  destination: (profile: Parameters<typeof destination>[0]) => destination(profile),
}));
vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  request: vi.fn(),
  learningApi: {
    dashboard: vi.fn(),
    progress: vi.fn(),
    catalog: vi.fn(),
    assessmentHistory: vi.fn(),
    currentTryout: vi.fn(),
    startTryout: vi.fn(),
    subchapter: vi.fn(),
    start: vi.fn(),
  },
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<object>()),
  joinClass: vi.fn(),
  getTeacherClasses: vi.fn(),
}));
const profile = {
  id: 'student-test',
  role: 'STUDENT',
  displayName: 'Siswa Fiktif',
  email: 'test@example.invalid',
  studentAffiliation: 'MANDIRI',
  status: 'ACTIVE',
  teacherVerified: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  context.pathname = '/student';
  context.levelFilter = '';
  context.state = { status: 'ready', profile, session: { access_token: 'test-token' } };
  vi.mocked(learningApi.dashboard).mockResolvedValue({
    displayName: profile.displayName,
    affiliation: 'MANDIRI',
    class: null,
    completedLevels: 0,
    availableLevels: 0,
    latestDrillScore: 0,
    bestDrillScore: 0,
    activities: [],
    activeDrill: null,
    features: {
      drill: true,
      tryout: true,
      pvp: false,
      classLeaderboard: false,
      pretest: false,
      pendingPolicies: [],
    },
  });
  vi.mocked(learningApi.progress).mockResolvedValue({
    completedLevels: 0,
    totalLevels: 0,
    latestScore: 0,
  });
  vi.mocked(learningApi.catalog).mockResolvedValue({ chapters: [] });
  vi.mocked(learningApi.assessmentHistory).mockResolvedValue({ records: [], nextCursor: null });
  vi.mocked(learningApi.currentTryout).mockResolvedValue({ state: 'unavailable' });
  vi.mocked(request).mockResolvedValue({ unreadCount: 0, latest: [] });
});
afterEach(cleanup);
function renderStudent(children: React.ReactNode) {
  return render(<StudentAccess>{children}</StudentAccess>);
}

describe('assessment history states', () => {
  const record = {
    attemptId: 'history-zero',
    activity: 'drill' as const,
    title: 'Riwayat fixture',
    isDemo: true,
    submittedAt: '2026-10-01T12:00:00Z',
    resultState: 'ready' as const,
    score: 0,
    chapterTitle: 'Bilangan',
    subchapterTitle: 'Pecahan',
    levelTitle: 'Level 1',
    xpState: 'pending' as const,
    starsState: 'pending' as const,
  };
  it('shows an empty history with a learning destination', async () => {
    renderStudent(<AssessmentScreen />);
    expect(await screen.findByText('Belum ada aktivitas')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mulai belajar' }).getAttribute('href')).toBe(
      '/student/learn',
    );
  });
  it('requests the selected level and renders persisted zero rewards', async () => {
    context.levelFilter = 'level-test';
    vi.mocked(learningApi.assessmentHistory).mockResolvedValue({
      records: [
        {
          ...record,
          xpState: 'ready',
          starsState: 'ready',
          xp: 0,
          stars: 0,
          levelId: 'level-test',
        },
      ],
      nextCursor: null,
    });
    renderStudent(<AssessmentScreen />);
    expect(await screen.findByText('0 XP')).toBeTruthy();
    expect(screen.getByText('Bintang: 0 / 3')).toBeTruthy();
    expect(learningApi.assessmentHistory).toHaveBeenCalledWith(
      'test-token',
      undefined,
      'level-test',
    );
    expect(screen.getByRole('heading', { name: 'Riwayat level' })).toBeTruthy();
  });
  it('shows loading without claiming an empty history', async () => {
    vi.mocked(learningApi.assessmentHistory).mockImplementation(() => new Promise(() => {}));
    renderStudent(<AssessmentScreen />);
    await waitFor(() => expect(screen.getAllByLabelText('Memuat data').length).toBeGreaterThan(0));
    expect(screen.queryByText('Belum ada aktivitas')).toBeNull();
  });
  it('keeps score zero, context and pending rewards; only released results have links', async () => {
    vi.mocked(learningApi.assessmentHistory).mockResolvedValue({
      records: [
        record,
        {
          ...record,
          attemptId: 'waiting',
          activity: 'tryout',
          title: 'Tryout pending',
          resultState: 'waitingIrt',
          score: null,
          starsState: 'notApplicable',
        },
        {
          ...record,
          attemptId: 'released',
          activity: 'tryout',
          title: 'Tryout released',
          score: 90,
          starsState: 'notApplicable',
        },
        {
          ...record,
          attemptId: 'pretest',
          activity: 'pretest',
          title: 'Pretest fixture',
          xpState: 'notApplicable',
          starsState: 'notApplicable',
        },
      ],
      nextCursor: null,
    });
    renderStudent(<AssessmentScreen />);
    await screen.findByText('Riwayat fixture');
    const zero = screen.getByRole('link', { name: /Riwayat fixture/ });
    expect(within(zero).getByText('0', { exact: true })).toBeTruthy();
    expect(within(zero).getByText('Bilangan · Pecahan · Level 1')).toBeTruthy();
    expect(within(zero).getByText('XP dan bintang belum tersedia')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Tryout pending/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Pretest fixture/ }).getAttribute('href')).toBe(
      '/student/pretest/pretest/result',
    );
    expect(screen.getByText('Menunggu hasil')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tryout released/ }).getAttribute('href')).toBe(
      '/student/tryout/released/result',
    );
  });
  it('keeps an old Drill score visible and linked from assessment history', async () => {
    vi.mocked(learningApi.assessmentHistory).mockResolvedValue({
      records: [
        {
          ...record,
          attemptId: 'expired-explanation-attempt',
          title: 'Drill lama',
          submittedAt: '2026-01-01T12:00:00Z',
          score: 80,
        },
      ],
      nextCursor: null,
    });
    renderStudent(<AssessmentScreen />);

    const oldResult = await screen.findByRole('link', { name: /Drill lama/ });
    expect(within(oldResult).getByText('80', { exact: true })).toBeTruthy();
    expect(oldResult.getAttribute('href')).toBe(
      '/student/drill/expired-explanation-attempt/result',
    );
  });
  it('retries a first-page network failure instead of showing empty data', async () => {
    vi.mocked(learningApi.assessmentHistory).mockRejectedValue(new Error('History offline'));
    renderStudent(<AssessmentScreen />);
    await screen.findByText('History offline', {}, { timeout: 5000 });
    expect(screen.queryByText('Belum ada aktivitas')).toBeNull();
    vi.mocked(learningApi.assessmentHistory).mockResolvedValue({
      records: [record],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Riwayat fixture')).toBeTruthy();
  });
  it('retains the first page during next-page failure and resumes with the same cursor', async () => {
    let online = false;
    vi.mocked(learningApi.assessmentHistory).mockImplementation(async (_token, cursor) => {
      if (!cursor) return { records: [record], nextCursor: 'next-page' };
      if (!online) throw new Error('Page offline');
      return {
        records: [{ ...record, attemptId: 'history-two', title: 'Attempt kedua', score: 70 }],
        nextCursor: null,
      };
    });
    renderStudent(<AssessmentScreen />);
    await screen.findByText('Riwayat fixture');
    fireEvent.click(screen.getByRole('button', { name: 'Muat hasil lain' }));
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getAllByText('Riwayat fixture')).toHaveLength(1);
    online = true;
    fireEvent.click(screen.getByRole('button', { name: 'Muat hasil lain' }));
    expect(await screen.findByText('Attempt kedua')).toBeTruthy();
    expect(screen.getAllByText('Riwayat fixture')).toHaveLength(1);
    expect(learningApi.assessmentHistory).toHaveBeenNthCalledWith(2, 'test-token', 'next-page');
    expect(learningApi.assessmentHistory).toHaveBeenNthCalledWith(3, 'test-token', 'next-page');
    expect(screen.queryByRole('button', { name: 'Muat hasil lain' })).toBeNull();
  });
  it('does not load personal history while signed out', async () => {
    context.state = { status: 'signed_out' };
    renderStudent(<AssessmentScreen />);
    await waitFor(() => expect(context.replace).toHaveBeenCalledWith('/'));
    expect(learningApi.assessmentHistory).not.toHaveBeenCalled();
  });
});
describe('responsive learning composition', () => {
  it('shows persisted TryOut XP while IRT is pending, including zero', () => {
    const view = render(<TryoutWaiting xp={245} />);
    expect(screen.getByText('245 XP')).toBeTruthy();
    expect(screen.queryByText(/Jawaban benar:/)).toBeNull();
    view.rerender(<TryoutWaiting xp={0} />);
    expect(screen.getByText('0 XP')).toBeTruthy();
  });
  it('shows stored XP on released TryOut without recomputing it from score', () => {
    render(
      <TryoutReleasedResult
        result={{
          attemptId: 'fixture',
          packageTitle: 'Fixture',
          score: 80,
          correctCount: 24,
          questionCount: 30,
          explanation: [],
          xp: 240,
          xpPolicyVersion: 1,
        }}
      />,
    );
    expect(screen.getByText('240 XP', { exact: true })).toBeTruthy();
    expect(screen.queryByText(/XP belum tersedia/)).toBeNull();
  });
  it('hides provisional Home podium values when the server policy is pending', async () => {
    const data = await learningApi.dashboard('test-token');
    data.class = { id: 'class-test', name: 'IX', schoolName: 'Sekolah fixture' };
    data.affiliation = 'SCHOOL';
    data.features.classLeaderboard = true;
    vi.mocked(request).mockResolvedValue({
      policyPending: true,
      entries: [
        { studentId: 'provisional', displayName: 'Provisional name', rank: 1, points: 99999 },
      ],
      ownEntry: { studentId: 'student-test', rank: 37, points: 12345 },
      unit: 'xp',
    });
    renderStudent(<HomeClassPodium token="test-token" data={data} />);
    await screen.findByText('Peringkat belum tersedia');
    expect(screen.queryByText('Provisional name')).toBeNull();
    expect(screen.queryByText(/99\.999|12\.345|#37/)).toBeNull();
    expect(request).toHaveBeenCalledWith('test-token', '/leaderboards/class');
  });
  it('keeps a Home self rank outside the podium and does not invent missing participants', async () => {
    const data = await learningApi.dashboard('test-token');
    data.class = { id: 'class-test', name: 'IX', schoolName: 'Sekolah fixture' };
    data.features.classLeaderboard = true;
    vi.mocked(request).mockResolvedValue({
      policyPending: false,
      entries: [{ studentId: 'other', displayName: 'Server student', rank: 2, points: 0 }],
      ownEntry: { studentId: 'student-test', displayName: 'Siswa Fiktif', rank: 37, points: 50 },
      unit: 'points',
    });
    renderStudent(<HomeClassPodium token="test-token" data={data} />);
    await screen.findByText('Server student');
    expect(screen.getByText('#37')).toBeTruthy();
    expect(screen.getByText('0 PTS')).toBeTruthy();
    expect(screen.getByText('50 PTS')).toBeTruthy();
    expect(screen.getAllByText('Belum ada peserta')).toHaveLength(2);
    expect(screen.queryByLabelText('Peringkat 1')).toBeNull();
  });
  it('does not request class ranks until the School feature is available', async () => {
    const data = await learningApi.dashboard('test-token');
    data.class = { id: 'class-test', name: 'IX', schoolName: 'Sekolah fixture' };
    data.affiliation = 'SCHOOL';
    renderStudent(<HomeClassPodium token="test-token" data={data} />);
    await screen.findByText('Peringkat belum tersedia');
    expect(request).not.toHaveBeenCalled();
  });
  it('retains the server self row when the top list is empty', async () => {
    const data = await learningApi.dashboard('test-token');
    data.affiliation = 'SCHOOL';
    data.class = { id: 'class-test', name: 'IX', schoolName: 'Sekolah fixture' };
    data.features.classLeaderboard = true;
    vi.mocked(request).mockResolvedValue({
      policyPending: false,
      entries: [],
      ownEntry: { studentId: 'student-test', displayName: 'Siswa Fiktif', rank: 37, points: 0 },
      unit: 'points',
    });
    renderStudent(<HomeClassPodium token="test-token" data={data} />);
    await screen.findByText('Podium masih kosong');
    expect(screen.getByText('#37')).toBeTruthy();
    expect(screen.getByText('0 PTS')).toBeTruthy();
  });
  it('keeps learning and feedback visible during a Tryout failure and can retry its query', async () => {
    vi.mocked(learningApi.currentTryout).mockRejectedValue(new Error('Tryout offline'));
    renderStudent(<NewStudentDashboard />);
    await screen.findByText('Tryout offline', {}, { timeout: 5000 });
    expect(screen.getByRole('heading', { name: /Fitur Belajar/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aktivitas Terakhir' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Feedback dari Guru' })).toBeTruthy();
    vi.mocked(learningApi.currentTryout).mockResolvedValue({
      state: 'open',
      eligible: true,
      title: 'Paket pulih',
      questionCount: 35,
      durationSeconds: 4800,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('region', { name: 'Paket pulih' })).toBeTruthy();
    expect(learningApi.startTryout).not.toHaveBeenCalled();
  });
  it('resumes the server-provided active attempt without creating a new Drill', async () => {
    const data = await learningApi.dashboard('test-token');
    data.activeDrill = {
      attemptId: 'persisted-active-attempt',
      levelId: 'server-level',
      title: 'Level server',
    };
    vi.mocked(learningApi.dashboard).mockResolvedValue(data);
    renderStudent(<NewStudentDashboard />);
    const resume = await screen.findByRole('link', { name: 'Lanjutkan latihan' });
    expect(resume.getAttribute('href')).toBe('/student/drill/persisted-active-attempt');
    expect(learningApi.start).not.toHaveBeenCalled();
  });
  it('keeps unreleased Home activity unlinked and displays a released score of zero', () => {
    const record = {
      attemptId: 'home-attempt',
      activity: 'tryout' as const,
      title: 'Tryout pending',
      isDemo: false,
      submittedAt: '2026-10-01T00:00:00Z',
      resultState: 'waitingIrt' as const,
      score: null,
    };
    const view = render(<HomeActivity item={record} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Menunggu hasil')).toBeTruthy();
    view.rerender(<HomeActivity item={{ ...record, resultState: 'ready', score: 0 }} />);
    expect(screen.getByText('Nilai: 0%')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/student/tryout/home-attempt/result',
    );
  });
  it('shows actual Tryout configuration for Mandiri without currency or class restrictions', () => {
    render(
      <HomeTryoutHero
        data={{
          id: 'test-package',
          title: 'Paket fixture',
          state: 'open',
          eligible: true,
          questionCount: 35,
          durationSeconds: 4800,
        }}
      />,
    );
    expect(screen.getByText('35 Soal • 80 Menit')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mulai Tryout' }).getAttribute('href')).toBe(
      '/student/tryout',
    );
    expect(screen.queryByText(/tiket|premium|Memerlukan kelas/i)).toBeNull();
  });
  it('shows persisted feedback previews and leaves the inbox read state unchanged', async () => {
    vi.mocked(request).mockResolvedValue({
      unreadCount: 1,
      latest: [
        {
          id: 'feedback-test',
          teacherName: 'Guru Test',
          body: '<script>Pesan Guru</script>',
          sentAt: '2026-10-01T00:00:00Z',
          readAt: null,
        },
      ],
    });
    renderStudent(<FeedbackOverview token="test-token" />);
    expect(await screen.findByText('1 catatan belum dibaca.')).toBeTruthy();
    expect(screen.getByText('<script>Pesan Guru</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('test-token', '/students/me/feedback/summary');
  });
  it('keeps ranks hidden when policy is pending, even if provisional rows are returned', async () => {
    vi.mocked(request).mockResolvedValue({
      periods: [],
      policyPending: true,
      entries: [
        { studentId: 'rank-test', displayName: 'Provisional student', rank: 1, points: 999 },
      ],
      ownEntry: { rank: 37, points: 500 },
      unit: 'points',
      period: { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-08T00:00:00Z' },
      updatedAt: null,
    });
    renderStudent(<LeaderboardsScreen />);
    await screen.findByText('Peringkat belum tersedia');
    expect(screen.queryByText('Provisional student')).toBeNull();
    expect(screen.queryByText('#37')).toBeNull();
  });
  it('renders top/self positions from the server including a self rank outside Top 10', async () => {
    vi.mocked(request).mockResolvedValue({
      periods: [],
      policyPending: false,
      entries: [{ studentId: 'rank-test', displayName: 'Server student', rank: 2, points: 100 }],
      ownEntry: { rank: 37, points: 50 },
      unit: 'points',
      period: { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-08T00:00:00Z' },
      updatedAt: '2026-10-02T01:00:00Z',
    });
    renderStudent(<LeaderboardsScreen />);
    await screen.findByText('Server student');
    expect(screen.getByText('#37')).toBeTruthy();
    expect(screen.getByLabelText('Peringkat 2')).toBeTruthy();
  });
  it('mounts Home with its query provider and truthful empty states, including a zero score', async () => {
    renderStudent(<NewStudentDashboard />);
    await screen.findByText('0 / 100');
    expect(
      within(screen.getByRole('region', { name: 'Status materi' })).getByText(
        'Materi sedang disiapkan',
      ),
    ).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Paket Tryout Mingguan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pretest belum tersedia' })).toBeNull();
    expect(document.querySelectorAll('.home-feature-grid > a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /Latihan Soal/ })).toBeTruthy();
    expect(screen.getAllByText('Progres level Drill').length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalledWith('test-token', '/leaderboards/class');
    expect(screen.getByRole('link', { name: 'Lihat Leaderboard' }).getAttribute('href')).toBe(
      '/student/leaderboards',
    );
    expect(screen.queryByText('Memerlukan kelas')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('XP')).toBeNull();
    expect(document.querySelector('a[href^="/demo"]')).toBeNull();
  });
  it('keeps three Home shortcuts when Pretest is enabled in Materi', async () => {
    const data = await learningApi.dashboard('test-token');
    data.features.pretest = true;
    vi.mocked(learningApi.dashboard).mockResolvedValue(data);
    renderStudent(<NewStudentDashboard />);
    expect(await screen.findByRole('link', { name: /Latihan Soal/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Pretest/ })).toBeNull();
    expect(document.querySelectorAll('.home-feature-grid > a')).toHaveLength(3);
  });
  it('marks the learning destination on nested Drill routes and removes navigation during an attempt', () => {
    context.pathname = '/student/drill/attempt-test';
    const view = render(<AppShell>Soal</AppShell>);
    const nav = screen.getByRole('navigation', { name: 'Navigasi Ruang belajar' });
    expect(within(nav).getByRole('link', { name: 'Materi' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getAllByRole('link')).toHaveLength(9);
    expect(within(nav).getByRole('link', { name: 'Feedback dari Guru' }).getAttribute('href')).toBe(
      '/student/feedback',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Navigasi utama' })).getAllByRole('link'),
    ).toHaveLength(5);
    view.rerender(<AppShell focus>Soal</AppShell>);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('does not fetch Student data while signed out', async () => {
    context.state = { status: 'signed_out' };
    renderStudent(<NewStudentDashboard />);
    await waitFor(() => expect(context.replace).toHaveBeenCalledWith('/'));
    expect(learningApi.dashboard).not.toHaveBeenCalled();
  });
  it.each(['TEST-CODE', 'QA2345'])(
    'joins class %s after trimming pasted spaces then refreshes authoritative account affiliation',
    async (joinCode) => {
      vi.mocked(joinClass).mockResolvedValue({
        class: { id: 'class-test', name: 'IX Fiktif' },
        joined: true,
      });
      renderStudent(<ProfileScreen />);
      fireEvent.change(screen.getByLabelText(/Kode kelas/), { target: { value: ` ${joinCode} ` } });
      fireEvent.click(screen.getByRole('button', { name: 'Gabung kelas' }));
      await waitFor(() => expect(joinClass).toHaveBeenCalledWith('test-token', joinCode));
      await waitFor(() => expect(context.refresh).toHaveBeenCalledOnce());
    },
  );
  it('offers practice when no Tryout package exists, without a class prerequisite', async () => {
    renderStudent(<TryoutScreen />);
    const link = await screen.findByRole('link', { name: 'Latihan dulu' }, { timeout: 5000 });
    expect(link.getAttribute('href')).toBe('/student/learn');
    expect(screen.getByText('Paket belum tersedia')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Gabung kelas' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mulai TryOut/ })).toBeNull();
  });
  it('starts a free Tryout for a Mandiri Student', async () => {
    vi.mocked(learningApi.currentTryout).mockResolvedValue({
      id: 'package-test',
      title: 'Paket Fiktif',
      releaseAt: '2026-09-27T17:00:00Z',
      state: 'open',
      eligible: true,
      attemptId: null,
      questionCount: 2,
      durationSeconds: 3600,
    });
    vi.mocked(learningApi.startTryout).mockResolvedValue({
      id: 'attempt-test',
      packageId: 'package-test',
      packageTitle: 'Paket Fiktif',
      status: 'inProgress',
      deadlineAt: null,
      questions: [],
    });
    renderStudent(<TryoutScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Detail dan aturan paket' }));
    fireEvent.click(screen.getByLabelText('Saya memahami aturan pengerjaan.'));
    const startButton = screen.getByRole('button', { name: 'Mulai TryOut' });
    fireEvent.click(startButton);
    fireEvent.click(startButton);
    await waitFor(() =>
      expect(learningApi.startTryout).toHaveBeenCalledWith('test-token', 'package-test'),
    );
    await waitFor(() => expect(context.push).toHaveBeenCalledWith('/student/tryout/attempt-test'));
    expect(learningApi.startTryout).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/TryOut gratis untuk seluruh siswa/)).toBeTruthy();
  });
  it.each(['inProgress', 'waitingIrt', 'resultReady'] as const)(
    'shows the existing %s attempt without a class warning or new start action',
    async (state) => {
      vi.mocked(learningApi.currentTryout).mockResolvedValue({
        id: 'package-test',
        title: 'Paket Fiktif',
        releaseAt: '2026-09-27T17:00:00Z',
        state,
        eligible: false,
        attemptId: 'attempt-test',
      });
      renderStudent(<TryoutScreen />);
      await screen.findByRole('heading', { name: 'Paket Fiktif' });
      expect(screen.queryByRole('button', { name: /Mulai TryOut/ })).toBeNull();
      expect(screen.queryByText(/sudah bergabung ke kelas/)).toBeNull();
      if (state === 'inProgress') {
        expect(screen.getByRole('link', { name: 'Lanjutkan TryOut' }).getAttribute('href')).toBe(
          '/student/tryout/attempt-test',
        );
      } else if (state === 'resultReady') {
        expect(
          screen.getByRole('link', { name: 'Lihat hasil simulasi' }).getAttribute('href'),
        ).toBe('/student/tryout/attempt-test/result');
      } else {
        expect(screen.getByRole('status').textContent).toContain('pembahasan belum tersedia');
        expect(screen.queryByRole('link', { name: 'Lihat hasil simulasi' })).toBeNull();
      }
    },
  );
  it('requires rules acknowledgement and recovers a failed start without duplicate requests', async () => {
    vi.mocked(learningApi.currentTryout).mockResolvedValue({
      id: 'package-test',
      title: 'Paket Fiktif',
      releaseAt: '2026-09-27T17:00:00Z',
      state: 'open',
      eligible: true,
    });
    vi.mocked(learningApi.startTryout)
      .mockRejectedValueOnce(new Error('Start terputus'))
      .mockResolvedValue({
        id: 'attempt-test',
        packageId: 'package-test',
        packageTitle: 'Paket Fiktif',
        status: 'inProgress',
        deadlineAt: null,
        questions: [],
      });
    renderStudent(<TryoutScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Detail dan aturan paket' }));
    const startButton = screen.getByRole('button', { name: 'Mulai TryOut' });
    expect(startButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(startButton);
    expect(learningApi.startTryout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Saya memahami aturan pengerjaan.'));
    fireEvent.click(startButton);
    fireEvent.click(startButton);
    await screen.findByRole('alert');
    expect(learningApi.startTryout).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai TryOut' }));
    await waitFor(() => expect(context.push).toHaveBeenCalledWith('/student/tryout/attempt-test'));
    expect(learningApi.startTryout).toHaveBeenCalledTimes(2);
  });
  it('loads additional history pages when the first page contains no Tryout and retries pagination', async () => {
    vi.mocked(learningApi.assessmentHistory)
      .mockResolvedValueOnce({
        records: [
          {
            attemptId: 'drill-test',
            activity: 'drill',
            title: 'Drill only fixture',
            isDemo: true,
            submittedAt: '2026-10-03T00:00:00Z',
            resultState: 'ready',
            score: 90,
          },
        ],
        nextCursor: 'cursor-test',
      })
      .mockRejectedValueOnce(new Error('Pagination terputus'))
      .mockRejectedValueOnce(new Error('Pagination terputus'))
      .mockResolvedValue({
        records: [
          {
            attemptId: 'tryout-test',
            activity: 'tryout',
            title: 'Historical Tryout fixture',
            isDemo: true,
            submittedAt: '2026-10-02T00:00:00Z',
            resultState: 'ready',
            score: 0,
          },
        ],
        nextCursor: null,
      });
    renderStudent(<TryoutScreen />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tryout Saya' }));
    await screen.findByText(/Belum ada Tryout pada aktivitas yang dimuat/);
    expect(screen.queryByText('Drill only fixture')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Muat riwayat lainnya' }));
    await screen.findByRole('alert', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Muat riwayat lainnya' }));
    await screen.findByRole('link', { name: /Historical Tryout fixture/ });
    expect(learningApi.assessmentHistory).toHaveBeenLastCalledWith('test-token', 'cursor-test');
    expect(screen.getByText('0', { exact: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Muat riwayat lainnya' })).toBeNull();
  });
  it('allows retry after a Tryout network error', async () => {
    vi.mocked(learningApi.currentTryout).mockRejectedValue(new Error('Koneksi terputus'));
    renderStudent(<TryoutScreen />);
    await screen.findByText('Koneksi terputus', {}, { timeout: 3000 });
    vi.mocked(learningApi.currentTryout).mockResolvedValue({ state: 'unavailable' });
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('Paket belum tersedia');
  });
  it('mounts Teacher queries under a provider and rejects a Student account', async () => {
    context.state = {
      status: 'ready',
      profile: { ...profile, role: 'TEACHER', teacherVerified: true },
      session: { access_token: 'teacher-test' },
    };
    vi.mocked(getTeacherClasses).mockResolvedValue({
      items: [{ id: 'class-test', name: 'IX Fiktif', joinCode: 'TEST' }],
    });
    const view = render(<TeacherDashboardScreen />);
    expect((await screen.findByRole('link', { name: /IX Fiktif/ })).getAttribute('href')).toBe(
      '/teacher/classes/class-test',
    );
    view.unmount();
    vi.mocked(getTeacherClasses).mockClear();
    context.state = { status: 'ready', profile, session: { access_token: 'test-token' } };
    render(<TeacherDashboardScreen />);
    await waitFor(() => expect(context.replace).toHaveBeenCalledWith('/student'));
    expect(getTeacherClasses).not.toHaveBeenCalled();
  });
  it('shows a verified Teacher account and signs out from Profile', async () => {
    context.pathname = '/teacher/profile';
    context.state = {
      status: 'ready',
      profile: { ...profile, role: 'TEACHER', teacherVerified: true },
      session: { access_token: 'teacher-test' },
    };
    render(<TeacherProfileScreen />);
    expect(screen.getByRole('heading', { name: 'Profil & akun' })).toBeTruthy();
    expect(screen.getAllByText('test@example.invalid')).toHaveLength(2);
    expect(screen.getByText('Terverifikasi')).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: /Kelas saya/ })
        .at(-1)
        ?.getAttribute('href'),
    ).toBe('/teacher');
    expect(screen.queryByRole('button', { name: /^Keluar$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keluar dari akun' }));
    await waitFor(() => expect(context.logout).toHaveBeenCalledOnce());
    await waitFor(() => expect(context.replace).toHaveBeenCalledWith('/'));
  });
  it('keeps Teacher Profile guarded and Admin logout in the shell', async () => {
    context.pathname = '/teacher/profile';
    render(<TeacherProfileScreen />);
    await waitFor(() => expect(context.replace).toHaveBeenCalledWith('/student'));
    expect(screen.queryByText('test@example.invalid')).toBeNull();
    cleanup();
    context.state = {
      status: 'ready',
      profile: { ...profile, role: 'TEACHER', teacherVerified: false },
      session: { access_token: 'teacher-test' },
    };
    render(<TeacherProfileScreen />);
    await waitFor(() =>
      expect(context.replace).toHaveBeenCalledWith('/teacher/verification-required'),
    );
    expect(screen.queryByText('test@example.invalid')).toBeNull();
    cleanup();
    context.pathname = '/admin/schools';
    context.state = {
      status: 'ready',
      profile: { ...profile, role: 'ADMIN' },
      session: { access_token: 'admin-test' },
    };
    render(<AppShell area="admin">Admin</AppShell>);
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Buka profil' })).toBeNull();
  });
  it('keeps an empty progress range finite and accessible', () => {
    render(<ProgressBar value={0} max={0} label="Level selesai" />);
    expect(
      screen.getByRole('progressbar', { name: 'Level selesai' }).getAttribute('aria-valuenow'),
    ).toBe('0');
    expect(document.body.innerHTML).not.toContain('NaN');
  });
  it('resumes only an accessible level through the API and keeps locked levels non-interactive', async () => {
    vi.mocked(learningApi.subchapter).mockResolvedValue({
      subchapter: { id: 'sub-test', chapterId: 'chapter-test', title: 'Subbab fiktif', order: 0 },
      levels: [
        {
          id: 'open-test',
          title: 'Level terbuka',
          order: 0,
          status: 'inProgress',
          latestScore: 0,
          bestScore: 0,
        },
        {
          id: 'locked-test',
          title: 'Level terkunci',
          order: 1,
          status: 'locked',
          latestScore: null,
          bestScore: null,
        },
      ],
    });
    vi.mocked(learningApi.start).mockResolvedValue({
      id: 'resume-test',
      levelId: 'open-test',
      levelTitle: 'Level terbuka',
      status: 'inProgress',
      startedAt: '2026-10-01T00:00:00Z',
      isDemo: true,
      questions: [],
    });
    renderStudent(<SubchapterScreen />);
    const resume = (await screen.findAllByRole('button', { name: 'Lanjutkan latihan' }))[0]!;
    expect(screen.queryByRole('button', { name: 'Mulai latihan' })).toBeNull();
    expect(screen.getByText('Terkunci')).toBeTruthy();
    fireEvent.click(resume);
    await waitFor(() => expect(context.push).toHaveBeenCalledWith('/student/drill/resume-test'));
    expect(learningApi.start).toHaveBeenCalledExactlyOnceWith('test-token', 'open-test');
  });
});
