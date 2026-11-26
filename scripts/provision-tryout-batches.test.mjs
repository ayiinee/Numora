import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { provision } from './provision-tryout-batches.mjs';

const config = JSON.parse(
  await readFile(new URL('./tryout-schools-20261126.json', import.meta.url)),
);
const now = Date.parse('2026-11-26T00:00:00+07:00');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture() {
  const state = { waves: [], batches: [], writes: 0, losePublishResponse: false };
  state.packageIds = [config.originalPackageId, config.variantPackageId];
  state.schools = config.schools.map((schoolName, i) => ({ schoolName, schoolId: id(i + 1) }));
  const api = async (path, body) => {
    if (path.includes('/options?'))
      return {
        waves: state.waves,
        packages: state.packageIds.map((packageId) => ({
          id: packageId,
          familyCode: packageId === config.originalPackageId ? 'UPLOAD-TEST' : 'GENERATOR_TEST',
          valid: true,
          status: 'PUBLISHED',
        })),
        packageTotal: state.packageIds.length,
        schools: state.schools,
        schoolTotal: state.schools.length,
      };
    if (path.includes('?')) return { items: state.batches, total: state.batches.length };
    if (body) {
      state.writes++;
      if (path.endsWith('/publish')) {
        const batch = state.batches.find((b) => path.includes(b.id));
        assert.equal(body.expectedRevision, batch.revision);
        batch.state = 'SCHEDULED';
        batch.revision++;
        if (state.losePublishResponse) {
          state.losePublishResponse = false;
          throw Error('Response lost after commit');
        }
        return { id: batch.id };
      }
      if (!body.waveId)
        state.waves.push({
          id: id(100),
          title: body.newWaveTitle,
          originalPackageId: body.packageIds[0],
          variantPackageId: body.packageIds[1],
          packages: body.packageIds.map((id) => ({ id })),
        });
      const batch = {
        ...body,
        id: id(200 + state.batches.length),
        waveId: body.waveId ?? state.waves[0].id,
        packages: body.packageIds.map((packageId) => ({ id: packageId })),
        state: 'DRAFT',
        revision: 1,
      };
      state.batches.push(batch);
      if (state.loseCreateResponse) {
        state.loseCreateResponse = false;
        throw Error('Response lost after commit');
      }
      return { id: batch.id };
    }
    return state.batches.find((b) => path.endsWith(b.id));
  };
  return { state, api };
}

test('preview resolves six schools without mutations; publication and rerun preserve one wave and six batches', async () => {
  const { state, api } = fixture();
  const preview = await provision(config, api, { now });
  assert.equal(preview.length, 6);
  assert(preview.every((p) => p.action === 'CREATE_AND_PUBLISH'));
  assert.equal(state.writes, 0);
  await provision(config, api, { apply: true, now });
  assert.equal(state.waves.length, 1);
  assert.equal(state.batches.length, 6);
  assert(
    state.batches.every(
      (b) => b.state === 'SCHEDULED' && b.schools.length === 1 && b.mandiriPackageId === null,
    ),
  );
  assert.equal(state.writes, 12);
  await provision(config, api, { apply: true, now });
  assert.equal(state.writes, 12);
});

test('five-package pool uses school IDs, subsets and a separate Mandiri batch; rerun is idempotent', async () => {
  const { state, api } = fixture();
  state.packageIds = [1, 2, 3, 4, 5].map((n) => id(1000 + n));
  const input = {
    waveTitle: 'TEST pools',
    startsAt: config.startsAt,
    closesAt: config.closesAt,
    packageIds: state.packageIds,
    schools: [
      {
        schoolId: state.schools[0].schoolId,
        name: 'TEST target by ID',
        packageIds: state.packageIds.slice(0, 3),
      },
    ],
    mandiriPackageIds: state.packageIds.slice(3),
    mandiriTitle: 'TEST Mandiri',
  };
  await provision(input, api, { apply: true, now: Date.parse(config.startsAt) + 1000 });
  assert.deepEqual(state.batches[0].schools[0].packageIds, state.packageIds.slice(0, 3));
  assert.deepEqual(state.batches[1].mandiriPackageIds, state.packageIds.slice(3));
  assert.deepEqual(state.batches[1].schools, []);
  await provision(input, api, { apply: true, now });
  assert.equal(state.writes, 4);
  await assert.rejects(
    provision({ ...input, packageIds: [...input.packageIds, id(1006)] }, api),
    /1-5/,
  );
  await assert.rejects(
    provision({ ...input, mandiriPackageIds: [id(9999)] }, api),
    /Subset Mandiri/,
  );
});

for (const lostResponse of ['losePublishResponse', 'loseCreateResponse'])
  test(`${lostResponse} resumes without duplicate batch or wave`, async () => {
    const { state, api } = fixture();
    state[lostResponse] = true;
    await assert.rejects(provision(config, api, { apply: true, now }), /Response lost/);
    await provision(config, api, { apply: true, now });
    assert.equal(state.waves.length, 1);
    assert.equal(state.batches.length, 6);
    assert.equal(state.writes, 12);
  });

test('missing school, changed existing schedule and elapsed close all abort before mutation', async () => {
  const { state, api } = fixture();
  state.schools.pop();
  await assert.rejects(provision(config, api, { apply: true, now }), /Sekolah tidak ditemukan/);
  assert.equal(state.writes, 0);
  await assert.rejects(
    provision({ ...config, schools: config.schools.slice(0, 1) }, api, {
      apply: true,
      now: Date.parse(config.closesAt),
    }),
    /Waktu tutup sudah lewat/,
  );
  assert.equal(state.writes, 0);
  await provision({ ...config, schools: config.schools.slice(0, 1) }, api, { apply: true, now });
  state.batches[0].closesAt = '2026-12-04T04:00:00+07:00';
  await assert.rejects(
    provision({ ...config, schools: config.schools.slice(0, 1) }, api, { apply: true, now }),
    /Jadwal batch existing berbeda/,
  );
  assert.equal(state.writes, 2);
});
