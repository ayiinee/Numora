import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Test-only transport fixture uses the API's existing Socket.IO dependency.
import { Server } from '../../api/node_modules/socket.io/dist/index.js';
import type { PvpSnapshotDto, LeaderboardDto } from '../src/features/core-learning/generated-types';

const selfId = '11111111-1111-4111-8111-111111111111';
const matchId = '77777777-7777-4777-8777-777777777777';
const roomCode = 'NMR842ABC123';
const http = createServer();
const transportOptions = {
  serveClient: false,
  cors: { origin: process.env.NUMORA_E2E_BASE_URL ?? 'http://localhost:3300' },
};
const transport = new Server(http, transportOptions);
const namespace = transport.of('/pvp');
let snapshot: PvpSnapshotDto;
let commands: { event: string; requestId: string; payload: Record<string, unknown> }[] = [];
const players = () => [
  {
    studentId: selfId,
    displayName: 'Kirino S.',
    slot: 1,
    ready: false,
    connectionStatus: 'CONNECTED',
    reconnectDeadlineAt: null,
    points: 340,
    result: null,
  },
  {
    studentId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Ahmad F.',
    slot: 2,
    ready: false,
    connectionStatus: 'CONNECTED',
    reconnectDeadlineAt: null,
    points: 290,
    result: null,
  },
];
function state(status: PvpSnapshotDto['status']): PvpSnapshotDto {
  return {
    matchId,
    roomCode,
    creatorStudentId: selfId,
    difficulty: 'medium',
    status,
    serverTime: new Date().toISOString(),
    isDemo: true,
    recordEligible: status === 'FINISHED',
    endReason: status === 'FINISHED' ? 'COMPLETED' : null,
    players: status === 'WAITING' ? players().slice(0, 1) : players(),
    question:
      status === 'RUNNING'
        ? {
            id: '55555555-5555-4555-8555-555555555555',
            order: 4,
            stem: 'Sebuah tempat parkir berisi 60 kendaraan yang terdiri dari mobil (roda 4) dan sepeda motor (roda 2). Jika jumlah seluruh roda adalah 172 buah, maka banyak sepeda motor di tempat parkir tersebut adalah…',
            options: [
              { id: 'A', text: '28 unit' },
              { id: 'B', text: '34 unit' },
              { id: 'C', text: '26 unit' },
              { id: 'D', text: '32 unit' },
            ],
            deadlineAt: new Date(Date.now() + 45_000).toISOString(),
            durationSeconds: 45,
            answered: false,
            selectedOptionId: null,
          }
        : null,
  };
}
function publish(next: PvpSnapshotDto) {
  snapshot = next;
  namespace.emit('room:state', { event: 'room:state', eventVersion: '1', payload: snapshot });
}
test.beforeAll(async () => {
  await new Promise<void>((done) => http.listen(3301, done));
  namespace.on('connection', (socket) => {
    socket.onAny(
      (
        event: string,
        body: { requestId: string; payload: Record<string, unknown> },
        ack: (value: unknown) => void,
      ) => {
        if (event !== 'match:reconnect') commands.push({ event, ...body });
        if (event === 'room:create' || event === 'room:join') snapshot = state('WAITING');
        if (event === 'player:ready')
          snapshot = {
            ...snapshot,
            players: snapshot.players.map((player) =>
              player.studentId === selfId ? { ...player, ready: true } : player,
            ),
          };
        if (event === 'answer:submit' && snapshot.question)
          snapshot = {
            ...snapshot,
            question: {
              ...snapshot.question,
              selectedOptionId: body.payload.optionId as string,
              answered: true,
            },
          };
        if (event === 'room:leave')
          snapshot = {
            ...snapshot,
            status: 'FINISHED',
            recordEligible: false,
            endReason: 'FORFEIT',
            question: null,
          };
        ack({ event: 'command:acknowledged', payload: { ok: true, state: snapshot } });
      },
    );
  });
});
test.afterAll(async () => {
  await new Promise<void>((done) => transport.close(() => done()));
});

async function fixtures(page: Page) {
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: selfId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ jwt, selfId }) =>
      localStorage.setItem(
        'sb-numora-e2e-auth-token',
        JSON.stringify({
          access_token: jwt,
          refresh_token: 'fixture-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: selfId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'fixture@example.test',
            app_metadata: { provider: 'google' },
            user_metadata: { name: 'Kirino S.' },
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      ),
    { jwt, selfId },
  );
  await page.route('https://numora-e2e.supabase.co/**', (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:3301/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown;
    if (path === '/identity/me')
      data = {
        id: selfId,
        displayName: 'Kirino S.',
        role: 'STUDENT',
        status: 'ACTIVE',
        email: 'fixture@example.test',
        studentAffiliation: 'MANDIRI',
        teacherVerified: null,
      };
    else if (path === '/students/me/dashboard')
      data = {
        displayName: 'Kirino S.',
        affiliation: 'MANDIRI',
        class: null,
        completedLevels: 14,
        availableLevels: 20,
        latestDrillScore: 85,
        bestDrillScore: 90,
        activities: [],
        activeDrill: null,
        features: {
          drill: true,
          tryout: true,
          pretest: false,
          pvp: true,
          classLeaderboard: false,
          pendingPolicies: [],
        },
      };
    else if (path === '/pvp/availability')
      data = { available: true, reasonCode: null, message: 'TEST ONLY: injected transport' };
    else if (path === '/pvp/invitations') data = { invites: [] };
    else if (path === '/pvp/classmates') data = { classmates: [] };
    else if (path.startsWith('/pvp/matches/')) data = snapshot;
    else if (path === '/leaderboards/periods') data = { periods: [] };
    else if (path.startsWith('/leaderboards/')) {
      const entries = [
        'Kevin S.',
        'Dinda Ayu',
        'Aris M.',
        'Nabila Az-Zahra',
        'Rizky Fauzi',
        'Siti Putri Nur',
        'Bima Hendrawan',
        'Kirino S.',
        'Taufik Wibowo',
        'Fadel Ananda',
      ].map((displayName, index) => ({
        studentId: index === 7 ? selfId : `TEST-rank-${index}`,
        displayName,
        points: 1490 - index * 25,
        rank: index + 1,
      }));
      data = {
        policyPending: false,
        reasonCode: null,
        className: null,
        unit: 'points',
        period: {
          startsAt: '2026-09-30T17:00:00Z',
          endsAt: '2026-10-07T17:00:00Z',
          timezone: 'Asia/Jakarta',
        },
        updatedAt: '2026-10-04T01:00:00Z',
        entries,
        ownEntry: entries[7]!,
      } satisfies LeaderboardDto;
    } else return route.fulfill({ status: 404, json: { detail: 'Unknown TEST-only request' } });
    await route.fulfill({ json: data });
  });
}

for (const width of [320, 360, 390, 393, 430, 768, 1024, 1280, 1440]) {
  test(`PvP visual evidence at ${width}px preserves ready, lock and server outcome`, async ({
    page,
  }) => {
    commands = [];
    snapshot = state('WAITING');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await fixtures(page);
    const folder = resolve(process.cwd(), '../../.tmp/redesign-phase5');
    await mkdir(folder, { recursive: true });
    async function capture(name: string) {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        return document.fonts.ready;
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const bounds = await page
        .locator('.numora-card, .pvp-hero, .pvp-header, .pvp-ranking-hero')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return {
              className: element.className,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              radius: getComputedStyle(element).borderRadius,
            };
          }),
        );
      await writeFile(
        resolve(folder, `${name}-${width}.json`),
        JSON.stringify({ width, overflow: false, bounds }, null, 2),
      );
      await page.screenshot({
        path: resolve(folder, `${name}-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal { display: none !important; }',
      });
    }
    await page.goto('/student/pvp');
    await expect(page.getByRole('button', { name: 'Buat room', exact: true })).toBeEnabled();
    await page.getByLabel(/Sedang.*45/).check();
    await capture('lobby-create');
    await page.getByRole('tab', { name: 'Gabung via Kode' }).click();
    await page.getByRole('textbox', { name: 'Kode room' }).fill(roomCode.toLowerCase());
    await capture('lobby-join');
    await page.getByRole('button', { name: 'Gabung room' }).click();
    await expect(page).toHaveURL(new RegExp(matchId));
    expect(commands[0]?.payload.roomCode).toBe(roomCode);
    await expect(page.getByRole('img', { name: 'QR link gabung room' })).toBeVisible();
    await capture('waiting');
    await page.getByRole('button', { name: 'Saya siap' }).click();
    await expect(page.getByRole('button', { name: 'Menunggu pemain lain' })).toBeDisabled();
    expect(snapshot.status).toBe('WAITING');
    publish(state('RUNNING'));
    await expect(page.getByRole('heading', { name: 'Duel Berlangsung' })).toBeVisible();
    await page.getByRole('radio', { name: /B\s*\.\s*34 unit/ }).check();
    await expect(page.getByText('Jawaban dipilih • Belum dikirim')).toBeVisible();
    await capture('battle-selected');
    await page.getByRole('button', { name: 'Kunci jawaban' }).click();
    await expect(page.getByText('Jawaban Kamu • Terkunci')).toBeVisible();
    await expect(page.getByRole('radio', { name: /A\s*\.\s*28 unit/ })).toBeDisabled();
    const answer = commands.find((command) => command.event === 'answer:submit');
    expect(answer?.payload).toEqual({ matchId, questionId: snapshot.question!.id, optionId: 'B' });
    expect(commands.filter((command) => command.event === 'answer:submit')).toHaveLength(1);
    await capture('battle-locked');
    publish({
      ...snapshot,
      serverTime: new Date().toISOString(),
      players: snapshot.players.map((player) =>
        player.studentId === selfId
          ? player
          : {
              ...player,
              connectionStatus: 'DISCONNECTED',
              reconnectDeadlineAt: new Date(Date.now() + 20_000).toISOString(),
            },
      ),
    });
    await expect(page.getByRole('timer', { name: 'Waktu reconnect Ahmad F.' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /A\s*\.\s*28 unit/ })).toBeDisabled();
    await capture('battle-reconnect');
    await page.getByRole('button', { name: 'Menyerah', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Menyerah dari duel?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Menyerah', exact: true })).toBeFocused();
    expect(commands.some((command) => command.event === 'room:leave')).toBe(false);
    publish({
      ...state('FINISHED'),
      players: players().map((player, index) => ({
        ...player,
        points: index ? 1080 : 1240,
        result: index ? 'LOSS' : 'WIN',
      })),
    });
    await expect(page.getByRole('heading', { name: 'Kemenangan!' })).toBeVisible();
    await expect(page.getByText('Rekor akan diperbarui oleh proyeksi leaderboard.')).toBeVisible();
    await capture('outcome');
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      await page.goto(`/student/leaderboards?difficulty=${difficulty}`);
      await expect(
        page.getByRole('button', {
          name: { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' }[difficulty],
          exact: true,
        }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('Podium Global PvP')).toBeVisible();
      await expect(page.getByText('#8', { exact: true })).toBeVisible();
      if (width < 960) {
        const order = await page.evaluate(() =>
          ['.pvp-ranking-podium', '.pvp-ranking-list', '.pvp-own-rank', '.pvp-ranking-period'].map(
            (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
          ),
        );
        expect(order, `${difficulty} leaderboard order`).toEqual([...order].sort((a, b) => a - b));
      }
      await capture(`leaderboard-${difficulty}`);
    }
    snapshot = state('RUNNING');
    await page.goto(`/student/pvp/${matchId}`);
    await expect(page.getByRole('button', { name: 'Menyerah', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Menyerah', exact: true }).click();
    await page.getByRole('button', { name: 'Ya, keluar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Duel berakhir karena menyerah' }),
    ).toBeVisible();
    await expect(
      page.getByText('Pertandingan ini tidak berkontribusi pada leaderboard.'),
    ).toBeVisible();
    expect(commands.filter((command) => command.event === 'room:leave')).toHaveLength(1);
    await capture('outcome-forfeit');
    expect(errors).toEqual([]);
  });
}
