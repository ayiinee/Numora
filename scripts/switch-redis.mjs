#!/usr/bin/env node
// Run on the Ubuntu VPS: node /opt/numora/scripts/switch-redis.mjs backup-1
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { autoFailover, FailoverError, validateFailoverState } from './redis-failover.mjs';

const ENV_FILE = '/etc/numora/production.env';
const SERVICES = ['numora-api', 'numora-worker'];
const PROFILE = /^(primary|backup-[1-9][0-9]*)$/;
const REDIS_LINE = /^\s*(?:export\s+)?REDIS_URL\s*=/;
const scriptPath = fileURLToPath(import.meta.url);
class OperatorError extends Error {}

export function profileFile(profile, directory = dirname(ENV_FILE)) {
  if (!PROFILE.test(profile ?? '')) throw new OperatorError('Pilih primary atau backup-1, backup-2, dan seterusnya.');
  return join(directory, `redis-${profile}.env`);
}

export function redisUrlFrom(text) {
  if (text.split(/\r?\n/).filter((line) => REDIS_LINE.test(line)).length !== 1) {
    throw new OperatorError('File harus memuat tepat satu baris REDIS_URL.');
  }
  let value;
  try {
    value = parseEnv(text).REDIS_URL;
  } catch {
    throw new OperatorError('Format REDIS_URL tidak valid; kredensial tidak ditampilkan.');
  }
  return validateRedisUrl(value);
}

function validateRedisUrl(value) {
  let url;
  try { url = new URL(value); } catch {
    throw new OperatorError('Format REDIS_URL tidak valid; kredensial tidak ditampilkan.');
  }
  if (url.protocol !== 'rediss:' || !url.hostname || /[\s"'\\#]/.test(value)) {
    throw new OperatorError('Gunakan URL TLS rediss://; karakter khusus kredensial harus di-URL-encode.');
  }
  return value;
}

export function replaceRedisUrl(text, value) {
  // Validate both inputs and preserve every other env line byte for byte.
  redisUrlFrom(text);
  validateRedisUrl(value);
  return text.split('\n').map((line) => REDIS_LINE.test(line)
    ? `REDIS_URL="${value}"${line.endsWith('\r') ? '\r' : ''}` : line).join('\n');
}

function readPrivateFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) {
    throw new OperatorError('File env harus berupa file biasa milik akun ini dengan izin 600 (chmod 600).');
  }
  return readFileSync(path, 'utf8');
}

function atomicWrite(path, text) {
  const temporary = `${path}.switch-${randomUUID()}`;
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch { /* Already renamed, or never created. */ }
  }
}

export async function probeRedis(Redis, url, prefix, { readOnly = false } = {}) {
  let client;
  // PING alone may pass while a provider rejects quota-consuming commands.
  const key = `${prefix}:redis-switch-probe:${randomUUID()}`;
  const value = randomUUID();
  try {
    client = new Redis(url, {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
      connectTimeout: 5000, commandTimeout: 5000, retryStrategy: () => null,
      enableReadyCheck: false, disableClientInfo: true,
    });
    client.on('error', () => {});
    await client.connect();
    if (readOnly) { await client.get(key); return; }
    if (await client.set(key, value, 'EX', 30, 'NX') !== 'OK') throw new Error();
    if (await client.get(key) !== value) throw new Error();
    await client.del(key);
  } catch (error) {
    const failure = new OperatorError('Tes baca/tulis Redis tujuan gagal. Periksa URL, TLS, izin, dan kuota tujuan.');
    // Preserve only a fixed classification; raw provider errors can contain credentials.
    failure.quotaExceeded = error instanceof Error && /max requests limit exceeded/i.test(error.message);
    throw failure;
  } finally {
    client?.disconnect();
  }
}

// Isolated orchestration allows rollback/failure tests without a production VPS.
export async function switchRedis({ original, target, probe, authorize, backup, readCurrent,
  write, stop, start, waitHealthy, log = console.log }) {
  const next = replaceRedisUrl(original, target);
  await probe();
  log('Redis tujuan: baca/tulis OK.');
  await authorize();
  if (readCurrent() !== original) throw new OperatorError('File production.env berubah. Jalankan ulang dari awal.');
  const backupPath = backup(original);
  log(`Backup konfigurasi: ${backupPath}`);
  try {
    await stop();
    // Detect edits made while systemd was stopping the services as well.
    if (readCurrent() !== original) throw new Error('File production.env berubah saat service dihentikan.');
    write(next);
    await start();
    await waitHealthy();
  } catch {
    log('Peralihan gagal; mencoba memulihkan konfigurasi sebelumnya.');
    try {
      await stop();
      // Do not overwrite an unrelated operator edit during rollback.
      if (![original, next].includes(readCurrent())) throw new Error();
      write(original);
      await start();
      await waitHealthy();
    } catch {
      throw new OperatorError(`Pemulihan belum terkonfirmasi. Periksa systemctl/journalctl; backup: ${backupPath}`);
    }
    throw new OperatorError('Peralihan gagal. Konfigurasi sebelumnya sudah dipulihkan dan service lolos pemeriksaan.');
  }
  log('Selesai: API sehat dan worker terhubung ke Redis.');
}

export function command(program, args, options = {}) {
  try {
    const output = execFileSync(program, args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000, ...options,
    });
    // sudo -v inherits the terminal for its password prompt and returns no buffer.
    return typeof output === 'string' ? output.trim() : '';
  } catch {
    throw new OperatorError(`Perintah ${program} gagal; periksa service/izin. Output sensitif disembunyikan.`);
  }
}

function systemctl(...args) {
  if (['show', 'is-active'].includes(args[0])) return command('systemctl', args);
  return command('sudo', ['-n', '/usr/bin/systemctl', ...args]);
}

async function waitHealthy(nonInteractive = false) {
  const deadline = Date.now() + 60_000;
  let consecutive = 0;
  while (Date.now() < deadline) {
    try {
      for (const service of SERVICES) systemctl('is-active', '--quiet', service);
      const invocation = systemctl('show', 'numora-worker', '-p', 'InvocationID', '--value');
      if (!/^[a-f0-9]{32}$/.test(invocation)) throw new Error();
      const journalArgs = ['--no-pager', '-o', 'cat', '-n', '200', `_SYSTEMD_INVOCATION_ID=${invocation}`];
      const logs = nonInteractive ? command('journalctl', journalArgs)
        : command('sudo', ['-n', 'journalctl', ...journalArgs]);
      if (!logs.includes('[worker] Redis connected; background processing enabled') ||
          logs.includes('REDIS_QUOTA_EXCEEDED')) throw new Error();
      const response = await fetch('http://127.0.0.1:3001/api/v1/health', {
        signal: AbortSignal.timeout(2000), redirect: 'error',
      });
      const body = await response.json();
      if (!response.ok || body.status !== 'ok' || body.service !== 'tka-api') throw new Error();
      // Avoid reporting a transient startup success immediately before a crash.
      if (++consecutive >= 3) return;
    } catch {
      consecutive = 0;
    }
    await delay(2000);
  }
  throw new Error('API/worker belum sehat dalam 60 detik.');
}

async function run(action, profile, { nonInteractive = false, expectedOriginal } = {}) {
  const original = readPrivateFile(ENV_FILE);
  if (expectedOriginal !== undefined && original !== expectedOriginal) {
    throw new OperatorError('File production.env berubah setelah probe; peralihan dibatalkan.');
  }
  const currentUrl = redisUrlFrom(original);
  if (action === 'save-current') {
    const profilePath = profileFile(profile);
    writeFileSync(profilePath, `REDIS_URL="${currentUrl}"\n`, { mode: 0o600, flag: 'wx' });
    console.log(`Koneksi saat ini disimpan: ${profilePath}. File yang sudah ada tidak ditimpa.`);
    return;
  }
  const prefix = parseEnv(original).BULLMQ_PREFIX;
  if (!prefix || prefix.includes('<')) throw new OperatorError('BULLMQ_PREFIX production belum valid.');
  const require = createRequire(new URL('../apps/worker/package.json', import.meta.url));
  const Redis = require('ioredis');
  if (action === 'auto') {
    const statePath = join(dirname(ENV_FILE), 'redis-failover-state.json');
    await autoFailover({
      currentUrl,
      loadCandidates: () => readdirSync(dirname(ENV_FILE))
        .filter((file) => /^redis-backup-[1-9][0-9]*\.env$/.test(file))
        .flatMap((file) => {
          const name = file.slice(6, -4);
          try { return [{ name, url: redisUrlFrom(readPrivateFile(profileFile(name))) }]; }
          catch { console.log(`[redis-failover] Profil ${name} tidak valid/privat; dilewati.`); return []; }
        }),
      probe: (url, options) => probeRedis(Redis, url, prefix, options),
      switchTo: (name) => run('switch', name, { nonInteractive: true, expectedOriginal: original }),
      readState: () => {
        try { return validateFailoverState(JSON.parse(readPrivateFile(statePath))); }
        catch (error) {
          if (error.code === 'ENOENT') return { version: 1, exhausted: [], cooldownUntil: 0 };
          throw new OperatorError('Tidak bisa membaca state failover privat; periksa redis-failover-state.json.');
        }
      },
      saveState: (state) => atomicWrite(statePath, `${JSON.stringify(state)}\n`),
    });
    return;
  }
  const target = redisUrlFrom(readPrivateFile(profileFile(profile)));
  await switchRedis({
    original, target,
    probe: () => probeRedis(Redis, target, prefix),
    authorize: () => {
      if (nonInteractive) {
        for (const operation of ['stop', 'reset-failed', 'start']) {
          command('sudo', ['-n', '-l', '/usr/bin/systemctl', operation, ...SERVICES]);
        }
      } else {
        command('sudo', ['-v'], { stdio: 'inherit' });
      }
      for (const service of SERVICES) {
        const files = systemctl('show', service, '-p', 'EnvironmentFiles', '--value');
        if (!files.split(/[\s;]/).includes(ENV_FILE)) {
          throw new OperatorError(`${service} harus membaca EnvironmentFile=${ENV_FILE}.`);
        }
      }
    },
    backup: (text) => {
      const path = `${ENV_FILE}.before-redis-switch-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
      writeFileSync(path, text, { mode: 0o600, flag: 'wx' });
      return path;
    },
    readCurrent: () => readPrivateFile(ENV_FILE),
    write: (text) => atomicWrite(ENV_FILE, text),
    stop: () => systemctl('stop', ...SERVICES),
    start: () => { systemctl('reset-failed', ...SERVICES); systemctl('start', ...SERVICES); },
    waitHealthy: () => waitHealthy(nonInteractive),
  });
  console.log(`Profil aktif: ${profile}. Antrean Redis lama tidak dipindahkan otomatis.`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const args = process.argv.slice(2);
  const locked = args.at(-1) === '--locked';
  if (locked) args.pop();
  const action = args[0] === 'save-current' ? 'save-current' : args[0] === 'auto' ? 'auto' : 'switch';
  const profile = args[action === 'save-current' ? 1 : 0];
  try {
    if (process.platform !== 'linux') throw new OperatorError('Jalankan skrip ini di VPS Ubuntu melalui PuTTY.');
    if (args.length !== (action === 'save-current' ? 2 : 1)) {
      throw new OperatorError('Pemakaian: node scripts/switch-redis.mjs auto | [save-current] primary|backup-1');
    }
    if (action !== 'auto') profileFile(profile);
    if (!locked) {
      const result = spawnSync('flock', ['-n', '-E', '75', '/etc/numora/redis-switch.lock',
        process.execPath, scriptPath, ...args, '--locked'], { stdio: 'inherit' });
      if (result.error) throw new OperatorError('flock tidak tersedia; instal paket util-linux.');
      if (result.status === 75) throw new OperatorError('Peralihan Redis lain sedang berjalan.');
      process.exitCode = result.status ?? 1;
    } else {
      await run(action, profile, { nonInteractive: action === 'auto' });
    }
  } catch (error) {
    // File/OS/library errors can carry credential contents; only display our own messages.
    console.error(error instanceof OperatorError || error instanceof FailoverError ? error.message : 'Operasi gagal. Periksa lokasi file, izin, dependensi, dan journalctl; detail sensitif disembunyikan.');
    process.exitCode = 1;
  }
}
