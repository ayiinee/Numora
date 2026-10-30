import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadyDrillTarget } from './ready-drill-fixture.mjs';
const client = { options: { host: ['127.0.0.1'], database: 'numora_test_ready' } };
test('synthetic READY fixture accepts a matching dedicated loopback connection', () => {
  assert.doesNotThrow(() =>
    assertReadyDrillTarget(client, 'postgres://fixture@127.0.0.1/numora_test_ready', 'test'),
  );
});
test('synthetic READY fixture rejects cloud, runtime and production targets', () => {
  for (const [url, mode] of [
    ['postgres://fixture@db.example/numora_test_ready', 'test'],
    ['postgres://fixture@localhost/production', 'test'],
    ['postgres://fixture@localhost/numora_test_ready', 'development'],
  ])
    assert.throws(() => assertReadyDrillTarget(client, url, mode), /LOCAL_TARGET_REQUIRED/);
});
test('synthetic READY fixture checks the actual client target as well as the supplied URL', () => {
  for (const options of [
    { host: ['db.example'], database: 'numora_test_ready' },
    { host: ['localhost'], database: 'production' },
  ])
    assert.throws(
      () =>
        assertReadyDrillTarget(
          { options },
          'postgres://fixture@localhost/numora_test_ready',
          'test',
        ),
      /LOCAL_TARGET_REQUIRED/,
    );
});
