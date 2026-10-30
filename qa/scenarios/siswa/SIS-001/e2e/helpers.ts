import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import type {
  DrillAttemptDto,
  DrillResultDto,
} from '../../../../../apps/web/src/features/core-learning/generated-types';
export type Actor = {
  profileId: string;
  session: { access_token: string; [key: string]: unknown };
};
export const api = 'http://localhost:3501/api/v1';
export const fixture = 'http://localhost:3502';
export const level = '00000000-0000-4000-8000-000000000102';
export const levelTwo = '00000000-0000-4000-8000-000000000103';
export const chapter = '00000000-0000-4000-8000-000000000100';
export const subchapter = '00000000-0000-4000-8000-000000000101';
export const test = base.extend<{ actor: Actor; student: Page }>({
  actor: async ({ request }, use) => {
    const fixtureResponse = await request.get(fixture + '/fixtures');
    expect(fixtureResponse.status()).toBe(200);
    expect((await fixtureResponse.json()).runId).toBe(process.env.QA_RUN_ID);
    const response = await request.post(fixture + '/actors');
    expect(response.status()).toBe(201);
    await use(await response.json());
  },
  student: async ({ browser, actor }, use) => {
    const context = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [
          {
            origin: 'http://localhost:3500',
            localStorage: [
              { name: 'sb-localhost-auth-token', value: JSON.stringify(actor.session) },
            ],
          },
        ],
      },
    });
    context.on('page', (page) => page.on('dialog', (dialog) => void dialog.accept()));
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
});
export const headers = (actor: Actor) => ({
  Authorization: 'Bearer ' + actor.session.access_token,
});
export async function start(request: APIRequestContext, actor: Actor): Promise<DrillAttemptDto> {
  const response = await request.post(api + '/assessments/drill/attempts', {
    headers: headers(actor),
    data: { levelId: level },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
export async function complete(
  request: APIRequestContext,
  actor: Actor,
  count: number,
): Promise<DrillResultDto> {
  const attempt = await start(request, actor);
  for (const [index, question] of attempt.questions.entries()) {
    const saved = await request.patch(
      api + '/assessment-attempts/' + attempt.id + '/answers/' + question.questionInstanceId,
      { headers: headers(actor), data: { optionId: index < count ? 'B' : 'A' } },
    );
    expect(saved.status()).toBe(200);
  }
  const submitted = await request.post(api + '/assessment-attempts/' + attempt.id + '/submit', {
    headers: headers(actor),
  });
  expect(submitted.status()).toBe(201);
  return submitted.json();
}
