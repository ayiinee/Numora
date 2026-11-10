import test from 'node:test';
import assert from 'node:assert/strict';
import {
  irtPurpose,
  assertIrtEnabled,
  assertRuntimeMode,
  assertIrtDatabase,
} from './runtime-mode.mjs';
test('production requires explicit mode, opt-in, database pin and matching runtime', async () => {
  const names = [
    'NUMORA_IRT_MODE',
    'NUMORA_IRT_RESEARCH_ENABLED',
    'NUMORA_IRT_PRODUCTION_ENABLED',
    'NUMORA_IRT_PRODUCTION_DATABASE',
  ];
  const before = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    for (const n of names) delete process.env[n];
    assert.equal(irtPurpose(), 'RESEARCH_ONLY');
    assert.throws(() => assertIrtEnabled(), /DISABLED/);
    process.env.NUMORA_IRT_MODE = 'PRODUCTION';
    assert.throws(() => assertIrtEnabled(), /PRODUCTION_DISABLED/);
    process.env.NUMORA_IRT_PRODUCTION_ENABLED = 'true';
    assert.equal(assertIrtEnabled(), 'PRODUCTION');
    process.env.NUMORA_IRT_RESEARCH_ENABLED = 'true';
    assert.throws(() => assertIrtEnabled(), /PRODUCTION_DISABLED/);
    delete process.env.NUMORA_IRT_RESEARCH_ENABLED;
    assert.throws(() => assertRuntimeMode({ purpose: 'RESEARCH_ONLY' }), /MODE_MISMATCH/);
    assertRuntimeMode({ purpose: 'PRODUCTION' });
    const db = async () => [{ name: 'approved-db' }];
    await assert.rejects(assertIrtDatabase(db), /DATABASE_MISMATCH/);
    process.env.NUMORA_IRT_PRODUCTION_DATABASE = 'approved-db';
    await assertIrtDatabase(db);
    delete process.env.NUMORA_IRT_PRODUCTION_ENABLED;
    process.env.NUMORA_IRT_MODE = 'RESEARCH';
    process.env.NUMORA_IRT_RESEARCH_ENABLED = 'true';
    await assert.rejects(assertIrtDatabase(db), /DISPOSABLE_ONLY/);
  } finally {
    for (const n of names)
      if (before[n] === undefined) delete process.env[n];
      else process.env[n] = before[n];
  }
});
