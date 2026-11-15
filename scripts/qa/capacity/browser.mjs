import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const requireWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));

export async function sampleBrowser(plan, samples, waitMs, signal, onIntegrity) {
  const { chromium, devices } = requireWeb('@playwright/test');
  await delay(waitMs, undefined, { signal });
  const browser = await chromium.launch({ timeout: 15000 });
  const stop = () => void browser.close().catch(() => {});
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  const origins = new Set([plan.web, plan.api]);
  const result = [];
  try {
    for (const sample of samples) {
      if (signal.aborted) break;
      const context = await browser.newContext({
        ...(sample.device === 'mobile'
          ? devices['Pixel 7']
          : { viewport: { width: 1440, height: 900 } }),
        storageState: sample.storageState,
        serviceWorkers: 'block',
      });
      const denied = new Set();
      // A browser can issue operations on mount; only same-origin navigation/reads are allowed here.
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const staticFile =
          url.origin === plan.web &&
          (/^\/_next\/static\//.test(path) || /^\/(?:favicon.ico|robots.txt)$/.test(path));
        const approvedRead = sample.readPaths.includes(path) || path === sample.path;
        const auth = url.origin === plan.web || url.origin === plan.api;
        if (
          auth &&
          origins.has(url.origin) &&
          ['GET', 'HEAD'].includes(request.method()) &&
          (approvedRead || staticFile)
        )
          return route.continue();
        if (auth && !['GET', 'HEAD'].includes(request.method())) denied.add(request.method());
        return route.abort();
      });
      try {
        const page = await context.newPage();
        const start = performance.now();
        const response = await page.goto(plan.web + sample.path, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page
          .getByRole('heading', { name: sample.heading, exact: true })
          .first()
          .waitFor({ timeout: 15000 });
        const pass = response?.status() === 200 && new URL(page.url()).pathname === sample.path;
        result.push({
          role: sample.role,
          device: sample.device,
          ms: Math.round(performance.now() - start),
          status: response?.status() ?? null,
          blockedMethods: [...denied],
          pass,
        });
        if (plan.environment === 'prod' && denied.size) onIntegrity('browser-unapproved-mutation');
      } catch {
        result.push({
          role: sample.role,
          device: sample.device,
          blockedMethods: [...denied],
          pass: false,
        });
      } finally {
        await context.close().catch(() => {});
      }
    }
  } finally {
    signal.removeEventListener('abort', stop);
    await browser.close().catch(() => {});
  }
  return {
    samples: result,
    pass: result.length === samples.length && result.every((entry) => entry.pass),
  };
}
