import { expect } from '@playwright/test';
import {
  test,
  start,
  complete,
  headers,
  api,
  fixture,
  chapter,
  subchapter,
  level,
  levelTwo,
} from './helpers';
import type {
  DrillAttemptDto,
  DrillResultDto,
  SubchapterDetailDto,
} from '../../../../../apps/web/src/features/core-learning/generated-types';

test('SIS-001 TC-001 real browser saves, resumes, submits 80 and retains one XP ledger entry', async ({
  student,
  request,
  actor,
}) => {
  await student.goto('/student/learn/' + chapter + '/' + subchapter);
  const started = student.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/assessments/drill/attempts'),
  );
  await student
    .getByRole('list', { name: 'Pilih level latihan' })
    .getByRole('button', { name: 'Mulai latihan', exact: true })
    .first()
    .click();
  const attempt: DrillAttemptDto = await (await started).json();
  expect(attempt.questions).toHaveLength(10);
  expect(JSON.stringify(attempt)).not.toMatch(/answerKey|correctOptionId|explanation/);
  const first = student.getByRole('radio').and(student.locator('input[value="B"]'));
  await expect(student).toHaveURL(new RegExp('/student/drill/' + attempt.id + '$'));
  await expect(first).toBeVisible();
  await student.context().setOffline(true);
  await first.check();
  await expect(student.getByRole('status').filter({ hasText: /^Belum tersimpan$/ })).toBeVisible();
  await student.context().setOffline(false);
  const retried = student.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.status() === 200,
  );
  await student.getByRole('button', { name: 'Coba simpan lagi', exact: true }).click();
  await retried;
  await student.reload();
  await expect(first).toBeChecked();
  for (let i = 1; i <= 10; i++) {
    await student.getByRole('button', { name: new RegExp('^Soal ' + i + ',') }).click();
    const option = student
      .getByRole('radio')
      .and(student.locator('input[value="' + (i <= 8 ? 'B' : 'A') + '"]'));
    if (!(await option.isChecked())) {
      const saved = student.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.status() === 200,
      );
      await option.check();
      await saved;
    }
    await expect(student.getByRole('status').filter({ hasText: /^Tersimpan$/ })).toBeVisible();
  }
  const submitted = student.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/submit'),
  );
  await student.getByRole('button', { name: 'Kirim Drill', exact: true }).click();
  await student
    .getByRole('dialog', { name: 'Kumpulkan Latihan Sekarang?', exact: true })
    .getByRole('button', { name: 'Ya, Kumpulkan Jawaban', exact: true })
    .click();
  const result: DrillResultDto = await (await submitted).json();
  expect(result.score).toBe(80);
  expect(result.reward).toMatchObject({ baseXp: 80, policyVersion: 2 });
  expect(result.unlockedLevelId).toBe(levelTwo);
  await expect(student).toHaveURL(new RegExp('/student/drill/' + attempt.id + '/result$'));
  await expect(
    student.getByText(String(result.reward!.totalXp) + ' XP', { exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(
    student.getByText(String(result.reward!.totalXp) + ' XP', { exact: true }),
  ).toBeVisible();
  for (const response of await Promise.all(
    [1, 2].map(() =>
      request.post(api + '/assessment-attempts/' + attempt.id + '/submit', {
        headers: headers(actor),
      }),
    ),
  )) {
    expect(response.status()).toBe(201);
    expect((await response.json()).reward).toEqual(result.reward);
  }
  const persisted = await (await request.get(fixture + '/persistence')).json();
  expect(
    persisted.rewards.filter((r: { attempt_id: string }) => r.attempt_id === attempt.id),
  ).toHaveLength(1);
  expect(
    persisted.events.filter((r: { entity_id: string }) => r.entity_id === attempt.id),
  ).toHaveLength(1);
  expect(
    persisted.pins.filter((r: { attempt_id: string }) => r.attempt_id === attempt.id),
  ).toHaveLength(10);
});

test('SIS-001 TC-002 70 does not unlock; 80 unlocks; latest zero preserves best and unlock history', async ({
  request,
  actor,
}) => {
  const failed = await complete(request, actor, 7);
  expect(failed.score).toBe(70);
  expect(failed.unlockedLevelId).toBeNull();
  const mastered = await complete(request, actor, 8);
  expect(mastered.score).toBe(80);
  expect(mastered.unlockedLevelId).toBe(levelTwo);
  const zero = await complete(request, actor, 0);
  expect(zero.score).toBe(0);
  const response = await request.get(api + '/subchapters/' + subchapter, {
    headers: headers(actor),
  });
  expect(response.status()).toBe(200);
  const detail: SubchapterDetailDto = await response.json();
  expect(detail.levels.find((item) => item.id === level)).toMatchObject({
    latestScore: 0,
    bestScore: 80,
  });
  expect(detail.levels.find((item) => item.id === levelTwo)?.status).toBe('open');
});

test('SIS-001 TC-003 anonymous, foreign Student and wrong role cannot read or modify the attempt', async ({
  request,
  actor,
  browser,
}) => {
  const attempt = await start(request, actor);
  const otherResponse = await request.post(fixture + '/actors');
  const other = await otherResponse.json();
  const all = await (await request.get(fixture + '/fixtures')).json();
  for (const actorHeaders of [
    {},
    headers(other),
    headers(all.actors.teacher),
    headers(all.actors.admin),
  ]) {
    for (const suffix of ['', '/result']) {
      const response = await request.get(api + '/assessment-attempts/' + attempt.id + suffix, {
        headers: actorHeaders,
      });
      expect([401, 403, 404]).toContain(response.status());
    }
    const response = await request.patch(
      api +
        '/assessment-attempts/' +
        attempt.id +
        '/answers/' +
        attempt.questions[0]!.questionInstanceId,
      { headers: actorHeaders, data: { optionId: 'B' } },
    );
    expect([401, 403, 404]).toContain(response.status());
  }
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/student/drill/' + attempt.id);
    await expect(page).toHaveURL('http://localhost:3500/');
    await expect(
      page.getByRole('button', { name: 'Lanjutkan dengan Google', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('SIS-001 TC-004 input validation, result gating and locked level are enforced by real HTTP', async ({
  request,
  actor,
}) => {
  const locked = await request.post(api + '/assessments/drill/attempts', {
    headers: headers(actor),
    data: { levelId: levelTwo },
  });
  expect(locked.status()).toBe(403);
  const attempt = await start(request, actor);
  const result = await request.get(api + '/assessment-attempts/' + attempt.id + '/result', {
    headers: headers(actor),
  });
  expect(result.status()).toBe(409);
  const invalid = await request.patch(
    api +
      '/assessment-attempts/' +
      attempt.id +
      '/answers/' +
      attempt.questions[0]!.questionInstanceId,
    { headers: headers(actor), data: { optionId: 42 } },
  );
  expect(invalid.status()).toBe(400);
  const saved = await request.get(api + '/assessment-attempts/' + attempt.id, {
    headers: headers(actor),
  });
  expect(saved.status()).toBe(200);
});
