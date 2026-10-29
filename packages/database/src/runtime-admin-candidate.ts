/** Rehearsal only: materialize the two published branches without changing live journals. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function runtimeAdminCandidate(target: string) {
  const main = resolve('drizzle');
  const admin = resolve('staging/fixtures/admin-pr92');
  const journal = JSON.parse(await readFile(join(main, 'meta/_journal.json'), 'utf8'));
  const adminJournal = JSON.parse(await readFile(join(admin, 'meta/_journal.json'), 'utf8'));
  const base = journal.entries.slice(0, 39) as { idx: number; tag: string; when: number }[];
  const entries = [...base, ...adminJournal.entries];
  const runtime = journal.entries.slice(39);
  if (
    runtime.length !== 2 ||
    runtime[0].tag !== '0039_pvp_transient_queue_guard' ||
    runtime[1].tag !== '0040_tryout_reward_decimal_guard'
  )
    throw new Error(
      'Unexpected runtime branch; review reconciliation before rebuilding candidate.',
    );
  await mkdir(join(target, 'meta'), { recursive: true });
  for (const e of base) await copyFile(join(main, e.tag + '.sql'), join(target, e.tag + '.sql'));
  for (const e of adminJournal.entries)
    await copyFile(join(admin, e.tag + '.sql'), join(target, e.tag + '.sql'));
  for (const e of runtime) {
    const idx = entries.length;
    const tag = String(idx).padStart(4, '0') + e.tag.slice(4);
    entries.push({ ...e, idx, tag, when: entries.at(-1)!.when + 1 });
    await copyFile(join(main, e.tag + '.sql'), join(target, tag + '.sql'));
  }
  await writeFile(join(target, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  return entries;
}
