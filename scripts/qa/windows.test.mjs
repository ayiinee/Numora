import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectWindowsSetup } from './windows.mjs';
test('missing WSL and pending restart produce actionable hints without installation', async () => {
  const commands = [];
  const result = await inspectWindowsSetup(
    'fixture',
    async (_root, command, args) => {
      commands.push([command, args]);
      return command === 'wsl.exe'
        ? { code: 1, output: '' }
        : { code: 0, output: '{"administrator":false,"restartPending":true}' };
    },
    'win32',
  );
  assert.equal(result.wslReady, false);
  assert.equal(result.installationNeedsAdministrator, true);
  assert.equal(result.restartPending, true);
  assert.equal(commands.length, 3);
  assert.ok(
    commands.every(([command, args]) => command !== 'wsl.exe' || !args.includes('--install')),
  );
});
test('installed distro is recognized and unavailable system probe remains unknown', async () => {
  const result = await inspectWindowsSetup(
    'fixture',
    async (_root, command, args) =>
      command !== 'wsl.exe'
        ? { code: 1, output: '' }
        : {
            code: 0,
            output: args.includes('--quiet') ? 'Ubuntu-24.04'.split('').join('\0') + '\r\n' : '',
          },
    'win32',
  );
  assert.equal(result.ubuntu2404Present, true);
  assert.equal(result.administrator, null);
  assert.equal(result.installationNeedsAdministrator, false);
  assert.deepEqual(
    await inspectWindowsSetup(
      '',
      () => {
        throw new Error('must not probe');
      },
      'linux',
    ),
    { applicable: false },
  );
});
