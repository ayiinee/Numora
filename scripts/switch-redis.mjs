#!/usr/bin/env node
// Run on the Ubuntu VPS: node /opt/numora/scripts/switch-redis.mjs backup-1
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

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

export async function probeRedis(Redis, url, prefix) {
  let client;
  // PING alone may pass while a provider rejects quota-consuming commands.
  const key = `${prefix}:redis-switch-probe:${randomUUID()}`;
  const value = randomUUID();
  try {
    client = new Redis(url, {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
      connectTimeout: 5000, commandTimeout: 5000, retryStrategy: () => null,
      enableReadyCheck: false,
    });
    client.on('error', () => {});
    await client.connect();
    if (await client.set(key, value, 'EX', 30, 'NX') !== 'OK') throw new Error();
    if (await client.get(key) !== value) throw new Error();
    await client.del(key);
  } catch {
    throw new OperatorError('Tes baca/tulis Redis tujuan gagal. Periksa URL, TLS, izin, dan kuota tujuan.');
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
  return command('sudo', ['-n', 'systemctl', ...args]);
}

async function waitHealthy() {
  const deadline = Date.now() + 60_000;
  let consecutive = 0;
  while (Date.now() < deadline) {
    try {
      for (const service of SERVICES) systemctl('is-active', '--quiet', service);
      const invocation = systemctl('show', 'numora-worker', '-p', 'InvocationID', '--value');
      if (!/^[a-f0-9]{32}$/.test(invocation)) throw new Error();
      const logs = command('sudo', ['-n', 'journalctl', '--no-pager', '-o', 'cat', '-n', '200',
        `_SYSTEMD_INVOCATION_ID=${invocation}`]);
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

async function run(action, profile) {
  const profilePath = profileFile(profile);
  const original = readPrivateFile(ENV_FILE);
  const currentUrl = redisUrlFrom(original);
  if (action === 'save-current') {
    writeFileSync(profilePath, `REDIS_URL="${currentUrl}"\n`, { mode: 0o600, flag: 'wx' });
    console.log(`Koneksi saat ini disimpan: ${profilePath}. File yang sudah ada tidak ditimpa.`);
    return;
  }
  const target = redisUrlFrom(readPrivateFile(profilePath));
  const prefix = parseEnv(original).BULLMQ_PREFIX;
  if (!prefix || prefix.includes('<')) throw new OperatorError('BULLMQ_PREFIX production belum valid.');
  const require = createRequire(new URL('../apps/worker/package.json', import.meta.url));
  const Redis = require('ioredis');
  await switchRedis({
    original, target,
    probe: () => probeRedis(Redis, target, prefix),
    authorize: () => {
      command('sudo', ['-v'], { stdio: 'inherit' });
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
    waitHealthy,
  });
  console.log(`Profil aktif: ${profile}. Antrean Redis lama tidak dipindahkan otomatis.`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const args = process.argv.slice(2);
  const locked = args.at(-1) === '--locked';
  if (locked) args.pop();
  const action = args[0] === 'save-current' ? 'save-current' : 'switch';
  const profile = args[action === 'save-current' ? 1 : 0];
  try {
    if (process.platform !== 'linux') throw new OperatorError('Jalankan skrip ini di VPS Ubuntu melalui PuTTY.');
    if (args.length !== (action === 'save-current' ? 2 : 1)) {
      throw new OperatorError('Pemakaian: node scripts/switch-redis.mjs [save-current] primary|backup-1');
    }
    profileFile(profile);
    if (!locked) {
      const result = spawnSync('flock', ['-n', '-E', '75', '/etc/numora/redis-switch.lock',
        process.execPath, scriptPath, ...args, '--locked'], { stdio: 'inherit' });
      if (result.error) throw new OperatorError('flock tidak tersedia; instal paket util-linux.');
      if (result.status === 75) throw new OperatorError('Peralihan Redis lain sedang berjalan.');
      process.exitCode = result.status ?? 1;
    } else {
      await run(action, profile);
    }
  } catch (error) {
    // File/OS/library errors can carry credential contents; only display our own messages.
    console.error(error instanceof OperatorError ? error.message : 'Operasi gagal. Periksa lokasi file, izin, dependensi, dan journalctl; detail sensitif disembunyikan.');
    process.exitCode = 1;
  }
}
