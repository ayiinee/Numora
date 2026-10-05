import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { Server } from '../../api/node_modules/socket.io/dist/index.js';

const student = '11111111-1111-4111-8111-111111111111';
const chapter = '22222222-2222-4222-8222-222222222222';
const sub = '33333333-3333-4333-8333-333333333333';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fixtures(page: Page) {
  const jwt = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: student,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ jwt, student }) =>
      localStorage.setItem(
        'sb-numora-e2e-auth-token',
        JSON.stringify({
          access_token: jwt,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: student,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'fixture@example.test',
            app_metadata: { provider: 'google' },
            user_metadata: { name: 'Kirino S.' },
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      ),
    { jwt, student },
  );
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  const now = Date.parse('2026-10-04T02:30:00Z');
  await page.clock.setFixedTime(new Date(now));
  const items = [
    {
      id: uuid(1),
      kind: 'PVP_INVITED',
      title: 'Tantangan Duel PvP: Farhan',
      body: 'Farhan (IX-B) menantangmu di Arena PvP Tingkat Sedang.',
      occurredAt: new Date(now - 600000).toISOString(),
      readAt: null,
      archived: false,
      action: {
        type: 'pvp',
        enabled: false,
        status: 'Kedaluwarsa',
        inviteId: uuid(11),
        matchId: uuid(12),
      },
    },
    {
      id: uuid(2),
      kind: 'FEEDBACK_RECEIVED',
      title: 'Catatan Baru dari Bu Ratna, M.Pd.',
      body: 'Bagus Kirino! Ketelitian aljabarmu meningkat pesat. Silakan lanjut ke Level 3…',
      occurredAt: new Date(now - 3600000).toISOString(),
      readAt: null,
      archived: false,
      action: { type: 'feedback', enabled: true, status: null, feedbackId: uuid(22) },
    },
    {
      id: uuid(3),
      kind: 'TRYOUT_OPENED',
      title: 'Paket Tryout Mingguan #04',
      body: 'Paket Tryout Matematika SMP sudah dapat dikerjakan. Buka paket untuk melihat ketentuan dan status pengerjaanmu.',
      occurredAt: new Date(now - 86400000).toISOString(),
      readAt: new Date(now).toISOString(),
      archived: false,
      action: { type: 'tryout', enabled: true, status: null },
    },
    {
      id: uuid(4),
      kind: 'LEVEL_UNLOCKED',
      title: 'Level 3 Terbuka!',
      body: 'Lanjutkan latihan Faktorisasi Kuadrat pada level yang baru terbuka.',
      occurredAt: new Date(now - 86400000 * 3).toISOString(),
      readAt: new Date(now).toISOString(),
      archived: false,
      action: {
        type: 'roadmap',
        enabled: true,
        status: null,
        chapterId: chapter,
        subchapterId: sub,
      },
    },
    {
      id: uuid(5),
      kind: 'TRYOUT_RESULT_READY',
      title: 'Hasil Tryout Sudah Tersedia',
      body: 'Hasil dan pembahasan Tryout Mingguan #03 sudah dirilis.',
      occurredAt: new Date(now - 86400000 * 8).toISOString(),
      readAt: new Date(now).toISOString(),
      archived: false,
      action: { type: 'result', enabled: true, status: null, attemptId: uuid(55) },
    },
  ];
  const archive = {
    ...items[3]!,
    id: uuid(6),
    title: 'Latihan bulan lalu',
    archived: true,
    occurredAt: new Date(now - 86400000 * 31).toISOString(),
  };
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/identity/me')
      data = {
        id: student,
        displayName: 'Kirino S.',
        role: 'STUDENT',
        status: 'ACTIVE',
        email: 'fixture@example.test',
        studentAffiliation: 'SCHOOL',
        teacherVerified: null,
      };
    else if (path === '/students/me/dashboard')
      data = {
        displayName: 'Kirino S.',
        affiliation: 'SCHOOL',
        class: { id: uuid(99), name: 'IX-B', schoolName: 'SMPN 1 Jakarta' },
        completedLevels: 6,
        availableLevels: 10,
        latestDrillScore: 85,
        bestDrillScore: 85,
        activeDrill: null,
        activities: [
          {
            attemptId: uuid(60),
            activity: 'drill',
            title: 'Faktorisasi Aljabar Kuadrat',
            isDemo: true,
            subchapterTitle: 'Subbab 2.1',
            submittedAt: new Date(now).toISOString(),
            resultState: 'ready',
            score: 85,
          },
        ],
        features: {
          drill: true,
          tryout: true,
          pvp: false,
          pretest: false,
          classLeaderboard: false,
          pendingPolicies: [],
        },
      };
    else if (path === '/tryout/packages/current')
      data = {
        id: uuid(90),
        title: 'TO TKA Matematika SMP #04',
        state: 'open',
        eligible: true,
        questionCount: 35,
        durationSeconds: null,
      };
    else if (path === '/students/me/materials')
      data = {
        recentChapterId: chapter,
        chapters: [
          {
            id: uuid(101),
            title: 'Bilangan Berpangkat & Eksponen',
            order: 1,
            category: 'numbers',
            totalLevels: 5,
            completedLevels: 5,
            continueSubchapterId: uuid(102),
            subchapters: [
              {
                id: uuid(102),
                title: 'Bilangan Berpangkat',
                order: 1,
                totalLevels: 5,
                completedLevels: 5,
                availableLevels: 5,
                latestScore: 100,
                bestScore: 100,
              },
            ],
          },
          {
            id: chapter,
            title: 'Persamaan & Fungsi Kuadrat',
            order: 2,
            category: 'algebra',
            totalLevels: 15,
            completedLevels: 3,
            continueSubchapterId: sub,
            subchapters: [
              {
                id: sub,
                title: 'Faktorisasi Kuadrat',
                order: 1,
                totalLevels: 5,
                completedLevels: 3,
                availableLevels: 4,
                latestScore: 85,
                bestScore: 85,
              },
              {
                id: uuid(103),
                title: 'Rumus abc & Diskriminan',
                order: 2,
                totalLevels: 5,
                completedLevels: 0,
                availableLevels: 1,
                latestScore: null,
                bestScore: null,
              },
              {
                id: uuid(104),
                title: 'Titik Puncak Parabola',
                order: 3,
                totalLevels: 5,
                completedLevels: 0,
                availableLevels: 1,
                latestScore: 0,
                bestScore: 0,
              },
            ],
          },
          {
            id: uuid(105),
            title: 'Transformasi Geometri',
            order: 3,
            category: 'geometry',
            totalLevels: 5,
            completedLevels: 0,
            continueSubchapterId: uuid(106),
            subchapters: [
              {
                id: uuid(106),
                title: 'Transformasi',
                order: 1,
                totalLevels: 5,
                completedLevels: 0,
                availableLevels: 1,
                latestScore: null,
                bestScore: null,
              },
            ],
          },
          {
            id: uuid(107),
            title: 'Statistika & Peluang',
            order: 4,
            category: 'statistics',
            totalLevels: 5,
            completedLevels: 0,
            continueSubchapterId: uuid(108),
            subchapters: [
              {
                id: uuid(108),
                title: 'Peluang',
                order: 1,
                totalLevels: 5,
                completedLevels: 0,
                availableLevels: 1,
                latestScore: null,
                bestScore: null,
              },
            ],
          },
        ],
      };
    else if (path === `/subchapters/${sub}`)
      data = {
        subchapter: { id: sub, chapterId: chapter, title: 'Faktorisasi Kuadrat', order: 1 },
        levels: [
          {
            id: uuid(80),
            title: 'Level 1',
            order: 1,
            status: 'unlocked',
            latestScore: null,
            bestScore: null,
          },
        ],
      };
    else if (path === '/students/me/learning-interactions') data = { state: 'policyPending' };
    else if (path === '/pvp/availability')
      data = { available: false, reasonCode: 'OPEN-07', message: 'PvP belum tersedia' };
    else if (path === '/students/me/notifications/summary')
      data = { total: items.length, unread: items.filter((i) => !i.readAt).length };
    else if (path === '/students/me/notifications/read-all') {
      for (const i of items) i.readAt = new Date().toISOString();
      data = { updated: items.length };
    } else if (path.endsWith('/read')) {
      const item = items.find((i) => path.includes(i.id));
      if (item) item.readAt = new Date().toISOString();
      data = { updated: 1 };
    } else if (path === '/students/me/notifications') {
      const filter = url.searchParams.get('filter');
      const selected =
        filter === 'archive'
          ? [archive]
          : items.filter((i) =>
              filter === 'unread'
                ? !i.readAt
                : filter === 'class'
                  ? ['PVP_INVITED', 'FEEDBACK_RECEIVED'].includes(i.kind)
                  : filter === 'tryout'
                    ? i.kind.startsWith('TRYOUT')
                    : filter === 'learning'
                      ? i.kind === 'LEVEL_UNLOCKED'
                      : true,
            );
      data = { items: selected, nextCursor: null };
    } else return route.fulfill({ status: 404, json: { detail: `Unexpected fixture ${path}` } });
    return route.fulfill({ json: data });
  });
}

for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`materials and notifications visual/interaction verification ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await fixtures(page);
    await page.setViewportSize({ width, height: width < 700 ? 900 : 1000 });
    const folder = resolve(process.cwd(), '../../.tmp/materials-notifications');
    await mkdir(folder, { recursive: true });
    async function capture(name: string) {
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        name,
      ).toBe(false);
      const viewport = page.viewportSize()!;
      if (width < 700)
        await page.setViewportSize({
          width,
          height: await page.evaluate(() => document.documentElement.scrollHeight),
        });
      await page.screenshot({
        path: resolve(folder, `${name}-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal { visibility:hidden; }',
      });
      await page.setViewportSize(viewport);
    }
    await page.goto('/student/learn');
    await expect(page.getByRole('heading', { name: 'Materi Belajar', exact: true })).toBeVisible();
    const accordion = page.getByRole('button', { name: /BAB 2 Aljabar/ });
    await expect(accordion).toHaveAttribute('aria-expanded', 'true');
    await capture('materials');
    await accordion.focus();
    await page.keyboard.press('Enter');
    await expect(accordion).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(accordion).toHaveAttribute('aria-expanded', 'true');
    await page.getByLabel('Cari materi, bab, atau subbab', { exact: true }).fill('Diskriminan');
    await expect(page).toHaveURL(/q=Diskriminan/);
    await expect(page.locator('.material-chapter')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Rumus abc/ })).toBeVisible();
    await page.getByLabel('Cari materi, bab, atau subbab', { exact: true }).fill('');
    await page.getByRole('button', { name: /1 Bab Geometri/ }).click();
    expect(new URL(page.url()).searchParams.has('q')).toBe(false);
    await expect(page.locator('.material-chapter')).toHaveCount(1);
    await page.getByRole('button', { name: /Lihat semua kategori/ }).click();
    expect(new URL(page.url()).searchParams.has('category')).toBe(false);
    await page.getByRole('link', { name: /2.1 Faktorisasi Kuadrat/ }).click();
    await expect(page).toHaveURL(`/student/learn/${chapter}/${sub}`);
    await page.goto(`/student/learn/${chapter}`);
    await expect(page).toHaveURL(`/student/learn?chapter=${chapter}`);
    await expect(page.getByRole('link', { name: /2.1 Faktorisasi Kuadrat/ })).toBeVisible();
    await page
      .getByRole('link', {
        name: width >= 960 ? 'Notifikasi' : /Lihat notifikasi/,
        exact: width >= 960,
      })
      .click();
    await expect(page.getByRole('heading', { name: 'Pusat Notifikasi' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Semua (5)', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Terima Duel' })).toHaveCount(0);
    await capture('notifications');
    await page.getByRole('button', { name: 'Belum Dibaca (2)', exact: true }).click();
    await expect(page.locator('.notification-item')).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Tandai dibaca: Catatan Baru dari Bu Ratna, M.Pd.' })
      .click();
    await expect(page.locator('.notification-item')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Belum Dibaca (1)', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Tandai Dibaca', exact: true }).click();
    await expect(page.getByText('Semua notifikasi sudah dibaca', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Arsip', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Latihan bulan lalu' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('notification failures preserve explicit read state and hide cached data when the session expires', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 900 });
  let status = 503;
  await page.route('http://localhost:3301/api/v1/students/me/notifications?**', async (route) => {
    if (status)
      return route.fulfill({
        status,
        json: { detail: status === 401 ? 'Sesi berakhir.' : 'TEST unavailable' },
      });
    return route.fallback();
  });
  await page.goto('/student/notifications');
  await expect(page.getByRole('heading', { name: 'Gagal memuat', exact: true })).toBeVisible();
  status = 0;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.locator('.notification-item')).toHaveCount(5);
  await page.route(
    `http://localhost:3301/api/v1/students/me/notifications/${uuid(2)}/read`,
    (route) => route.fulfill({ status: 503, json: { detail: 'TEST read failed' } }),
  );
  await page
    .getByRole('button', { name: 'Tandai dibaca: Catatan Baru dari Bu Ratna, M.Pd.' })
    .click();
  await expect(page.locator('.form-error[role=alert]')).toContainText('Layanan sedang bermasalah');
  await expect(page.getByRole('button', { name: 'Belum Dibaca (2)', exact: true })).toBeVisible();
  status = 401;
  await page.getByRole('button', { name: 'Aktivitas Kelas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sesi berakhir', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Masuk kembali', exact: true })).toBeVisible();
  await expect(page.locator('.notification-item')).toHaveCount(0);
});

test('materials shows empty published content without manufacturing locked chapters', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('http://localhost:3301/api/v1/students/me/materials', (route) =>
    route.fulfill({ json: { chapters: [], recentChapterId: null } }),
  );
  await page.goto('/student/learn');
  await expect(page.getByText('Materi sedang disiapkan', { exact: true })).toBeVisible();
  await expect(page.locator('.material-chapter')).toHaveCount(0);
  for (const button of await page.locator('.material-category').all())
    await expect(button).toBeDisabled();
});

test('notification invitation retry preserves its request identifier and refreshes the actual status', async ({
  page,
}) => {
  const http = createServer();
  const notificationTransportOptions = {
    serveClient: false,
    cors: { origin: 'http://localhost:3300' },
  };
  const transport = new Server(http, notificationTransportOptions);
  const commands: string[] = [];
  let responded = false;
  transport.of('/pvp').on('connection', (socket) =>
    socket.on(
      'invitation:respond',
      (
        message: { requestId: string; payload: { inviteId: string; accept: boolean } },
        ack: (value: object) => void,
      ) => {
        expect(message.payload).toEqual({ inviteId: uuid(11), accept: false });
        commands.push(message.requestId);
        if (commands.length === 1) return; // Lost acknowledgement; no new request ID on retry.
        responded = true;
        ack({ payload: { ok: true, requestId: message.requestId } });
      },
    ),
  );
  await new Promise<void>((resolve) => http.listen(3301, '127.0.0.1', resolve));
  try {
    await fixtures(page);
    await page.route('http://localhost:3301/api/v1/pvp/availability', (route) =>
      route.fulfill({
        json: { available: true, reasonCode: null, message: 'TEST ONLY transport' },
      }),
    );
    await page.route('http://localhost:3301/api/v1/students/me/notifications?**', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: uuid(1),
              kind: 'PVP_INVITED',
              title: 'Tantangan TEST',
              body: 'TEST ONLY',
              occurredAt: new Date().toISOString(),
              readAt: null,
              archived: false,
              action: {
                type: 'pvp',
                enabled: !responded,
                status: responded ? 'Ditolak' : null,
                inviteId: uuid(11),
                matchId: uuid(12),
              },
            },
          ],
          nextCursor: null,
        },
      }),
    );
    await page.goto('/student/notifications');
    await expect(page.getByRole('button', { name: 'Tolak', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Tolak', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Periksa permintaan sebelumnya', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Periksa permintaan sebelumnya', exact: true }).click();
    await expect(page.getByText('Ditolak', { exact: true })).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toBe(commands[1]);
    await expect(page.getByRole('button', { name: 'Tolak', exact: true })).toHaveCount(0);
  } finally {
    await new Promise<void>((resolve) => transport.close(() => resolve()));
  }
});
