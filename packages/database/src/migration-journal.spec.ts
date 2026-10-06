import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('reconciled Drizzle migration ordering', () => {
  it('keeps unique sequential tags and increasing cursors so upgrades cannot skip new DDL', async () => {
    const journal = JSON.parse(await readFile(resolve('drizzle/meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string; when: number }[];
    };
    expect(new Set(journal.entries.map((entry) => entry.tag)).size).toBe(journal.entries.length);
    for (const [index, entry] of journal.entries.entries()) {
      expect(entry.idx).toBe(index);
      expect(entry.tag.slice(0, 4)).toBe(String(index).padStart(4, '0'));
      if (index > 0) expect(entry.when).toBeGreaterThan(journal.entries[index - 1]!.when);
    }
    expect(journal.entries[12]!.tag).toBe('0012_square_gargoyle');
    expect(journal.entries[13]!.tag).toBe('0013_chemical_wallflower');
  });

  it('chains the merged snapshots from main through the separated compute additions', async () => {
    const snapshots = await Promise.all(
      [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27].map(async (index) => {
        return JSON.parse(
          await readFile(
            resolve(`drizzle/meta/${String(index).padStart(4, '0')}_snapshot.json`),
            'utf8',
          ),
        ) as { id: string; prevId: string };
      }),
    );
    expect(new Set(snapshots.map((snapshot) => snapshot.id)).size).toBe(snapshots.length);
    for (let index = 1; index < snapshots.length; index++)
      expect(snapshots[index]!.prevId).toBe(snapshots[index - 1]!.id);
  });
});
