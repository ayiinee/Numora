import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAdminWorkbench } from './content-api';

afterEach(() => vi.unstubAllGlobals());
describe('Admin independent workbench loading', () => {
  it('paginates the compact Content question catalog on the server, without narrowing other tabs', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        paths.push(input);
        return new Response(JSON.stringify({ items: [], nextOffset: null }));
      }),
    );
    await loadAdminWorkbench('TEST ONLY', 5, 'questions', {}, true);
    const bank = new URL(paths.find((p) => p.includes('/content/versions'))!);
    expect(bank.searchParams.get('limit')).toBe('5');
    expect(bank.searchParams.get('offset')).toBe('5');
    expect(bank.searchParams.get('catalog')).toBe('COMPACT_DEMO');
    paths.length = 0;
    await loadAdminWorkbench('TEST ONLY', 20, 'verification', {}, true);
    const history = new URL(paths.find((p) => p.includes('/content/versions'))!);
    expect(history.searchParams.get('limit')).toBe('20');
    expect(history.searchParams.has('catalog')).toBe(false);
  });
  it('keeps the question editor usable when optional metrics fail and never requests unrelated queues', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        paths.push(input);
        return new Response(
          JSON.stringify(input.includes('dashboard') ? { detail: 'Unavailable' } : { items: [] }),
          { status: input.includes('dashboard') ? 503 : 200 },
        );
      }),
    );
    const result = await loadAdminWorkbench('TEST ONLY', 0, 'questions');
    expect(result.versions.items).toEqual([]);
    expect(result.dashboard).toBeNull();
    expect(paths.some((p) => /admin\/(irt|reports|audit-logs)/.test(p))).toBe(false);
  });
  it('surfaces an IRT tab failure without loading the question editor or unrelated queues', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        paths.push(input);
        return new Response(
          JSON.stringify({ code: 'IRT_UNAVAILABLE', detail: 'IRT unavailable' }),
          { status: 503 },
        );
      }),
    );
    await expect(loadAdminWorkbench('TEST ONLY', 0, 'irt')).rejects.toMatchObject({
      code: 'IRT_UNAVAILABLE',
    });
    expect(paths.some((p) => p.includes('/content/versions'))).toBe(false);
  });
});
