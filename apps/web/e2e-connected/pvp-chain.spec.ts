import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Session } from '@supabase/supabase-js';
import type { LeaderboardDto, PvpSnapshotDto } from '../src/features/core-learning/generated-types';
type Actor = { profileId: string; session: Session };
test('two browsers: Mandiri + School, real Nest/Postgres/Redis → DEMO match → projection → leaderboard', async ({
  browser,
  request,
}) => {
  const fixtures = (await (await request.get('http://localhost:3452/fixtures')).json()) as {
    sha: string;
    actors: Record<string, Actor>;
    classId: string;
  };
  const contexts = await Promise.all(
    ['mandiri', 'school'].map((alias) =>
      browser.newContext({
        storageState: {
          cookies: [],
          origins: [
            {
              origin: 'http://localhost:3450',
              localStorage: [
                {
                  name: 'sb-localhost-auth-token',
                  value: JSON.stringify(fixtures.actors[alias]!.session),
                },
              ],
            },
          ],
        },
      }),
    ),
  );
  const [host, guest] = (await Promise.all(contexts.map((c) => c.newPage()))) as [Page, Page];
  for (const page of [host, guest]) page.on('dialog', (d) => void d.accept());
  const headers = (alias: string) => ({
    Authorization: `Bearer ${fixtures.actors[alias]!.session.access_token}`,
  });
  const api = 'http://localhost:3451/api/v1';
  const checks: string[] = [];
  try {
    const availability = await (await request.get(`${api}/pvp/availability`, {
      headers: headers('mandiri'),
    })).json();
    expect(availability.difficulties.every((d: { available: boolean }) => d.available)).toBe(true);
    for (const difficulty of ['easy', 'medium', 'hard']) {
      await Promise.all([host.goto('/student/pvp'), guest.goto('/student/pvp')]);
      await expect(host.getByText('PvP DEMO', { exact: true })).toBeVisible();
      const label = { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' }[difficulty]!;
      await host.getByRole('radio', { name: new RegExp(label) }).click();
      await host.getByRole('button', { name: 'Buat room', exact: true }).click();
      await expect(host).toHaveURL(/\/student\/pvp\/[0-9a-f-]{36}$/);
      const matchId = host.url().split('/').at(-1)!;
      const snapshot = (await (
        await request.get(`${api}/pvp/matches/${matchId}`, { headers: headers('mandiri') })
      ).json()) as PvpSnapshotDto;
      await guest.getByRole('tab', { name: /Gabung via Kode/ }).click();
      await guest.getByLabel('Kode room').fill(snapshot.roomCode);
      await guest.getByRole('button', { name: 'Gabung room', exact: true }).click();
      await expect(guest).toHaveURL(new RegExp(matchId));
      await Promise.all([
        host.getByRole('button', { name: 'Saya siap', exact: true }).click(),
        guest.getByRole('button', { name: 'Saya siap', exact: true }).click(),
      ]);
      for (let round = 1; round <= 10; round++) {
        await Promise.all([host, guest].map((page) =>
          expect(page.getByText(`Ronde ${round}/10`, { exact: true })).toBeVisible()));
        const states = await Promise.all(['mandiri', 'school'].map(async (alias) =>
          (await (await request.get(`${api}/pvp/matches/${matchId}`, { headers: headers(alias) })).json()) as PvpSnapshotDto));
        expect(states[0]!.question).toEqual(states[1]!.question);
        expect(JSON.stringify(states)).not.toMatch(/answerKey|correctOptionId|explanation/);
        if (round === 1) {
          await host.reload();
          await expect(host.getByText('Ronde 1/10', { exact: true })).toBeVisible();
          const resumed = (await (await request.get(`${api}/pvp/matches/${matchId}`, {
            headers: headers('mandiri'),
          })).json()) as PvpSnapshotDto;
          expect(resumed.question!.id).toBe(states[0]!.question!.id);
          expect(resumed.question!.stem).toBe(states[0]!.question!.stem);
        }
        await Promise.all(
          [host, guest].map(async (page) => {
            await expect(page.getByText(`Ronde ${round}/10`, { exact: true })).toBeVisible();
            await page.getByRole('radio').first().click();
            await page.getByRole('button', { name: 'Kunci jawaban', exact: true }).click();
          }),
        );
      }
      await expect
        .poll(
          async () =>
            (
              await (
                await request.get(`${api}/pvp/matches/${matchId}`, { headers: headers('mandiri') })
              ).json()
            ).status,
        )
        .toBe('FINISHED');
      const result = (await (
        await request.get(`${api}/pvp/matches/${matchId}`, { headers: headers('school') })
      ).json()) as PvpSnapshotDto;
      expect(result).toMatchObject({ recordEligible: true, endReason: 'COMPLETED', isDemo: true });
      expect(result.players).toHaveLength(2);
      expect(result.players.every((p) => p.points >= 1000 && p.points <= 1500)).toBe(true);
      await request.post('http://localhost:3452/project');
      const board = (await (
        await request.get(`${api}/leaderboards/pvp?difficulty=${difficulty}`, {
          headers: headers('mandiri'),
        })
      ).json()) as LeaderboardDto;
      expect(board).toMatchObject({
        dataMode: 'demo',
        rankPolicyVersion: 'dense-v1',
        stale: false,
      });
      expect(board.ownEntry?.points).toBe(
        result.players.find((p) => p.studentId === fixtures.actors.mandiri!.profileId)!.points,
      );
      await host.goto(`/student/leaderboards?difficulty=${difficulty}`);
      await expect(host.getByText('Leaderboard PvP DEMO', { exact: true })).toBeVisible();
      await expect(host.getByRole('heading', { name: 'Posisimu' })).toBeVisible();
      checks.push(
        `${difficulty}: two-browser completed 10-item match, durable result, DEMO projection and own rank`,
      );
    }
    // Actual Drill submit posts XP; projection copies that ledger amount without recomputing it.
    const started = await request.post(`${api}/assessments/drill/attempts`, {
      headers: headers('school'),
      data: { levelId: '00000000-0000-4000-8000-000000000102' },
    });
    expect(started.ok()).toBe(true);
    const attempt = await started.json();
    for (const item of attempt.questions) {
      const saved = await request.patch(
        `${api}/assessment-attempts/${attempt.id}/answers/${item.questionInstanceId}`,
        { headers: headers('school'), data: { optionId: 'A' } },
      );
      expect(saved.ok()).toBe(true);
    }
    const submitted = await request.post(`${api}/assessment-attempts/${attempt.id}/submit`, {
      headers: headers('school'),
    });
    expect(submitted.ok()).toBe(true);
    await request.post('http://localhost:3452/project');
    const activity = (await (
      await request.get(`${api}/leaderboards/activity`, { headers: headers('school') })
    ).json()) as LeaderboardDto;
    const cls = (await (
      await request.get(`${api}/leaderboards/class?classId=${fixtures.classId}`, {
        headers: headers('school'),
      })
    ).json()) as LeaderboardDto;
    const persistence = await (await request.get('http://localhost:3452/persistence')).json();
    const xp = persistence.rewards.reduce(
      (sum: number, row: { xp_amount: string }) => sum + Number(row.xp_amount),
      0,
    );
    expect(xp).toBeGreaterThan(0);
    expect(activity.ownEntry?.points).toBe(xp);
    expect(cls.ownEntry?.points).toBe(xp);
    expect(persistence.matches.every((m: { questions: number }) => m.questions === 10)).toBe(true);
    expect(persistence.matches.every((m: { families: number; ready_drill: boolean; frozen: boolean }) =>
      m.families === 10 && m.ready_drill && m.frozen)).toBe(true);
    checks.push('random READY Drill bank: ten unique families/difficulty, equal questions/order, browser reload reconnect, frozen snapshots');
    checks.push('actual Drill submit → immutable XP ledger → identical class/global account XP');
    const folder = resolve(__dirname, '../../../.tmp/job16-acceptance');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      resolve(folder, 'connected-evidence.json'),
      JSON.stringify(
        {
          baseSha: fixtures.sha,
          workingTree: 'uncommitted increment',
          environment: 'isolated localhost',
          auth: 'TEST FIXTURE; real staging identities still required',
          checks,
          result: 'PASS',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
