import assert from 'node:assert/strict';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const base = 'admin/tryout-batches';
const normalize = (s) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function pages(api, path, key, totalKey) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await api(`${path}?limit=100&offset=${offset}`);
    assert(Array.isArray(page[key]) && Number.isInteger(page[totalKey]), 'Respons API tidak sah.');
    rows.push(...page[key]);
    if (rows.length >= page[totalKey]) return rows;
    assert(page[key].length, 'Pagination API tidak lengkap.');
  }
  throw new Error('Pagination melebihi batas 10000; tidak ada data yang ditulis.');
}

export async function provision(config, api, { apply = false, now = Date.now() } = {}) {
  assert(
    config &&
      typeof config.waveTitle === 'string' &&
      config.waveTitle.trim().length <= 160 &&
      config.waveTitle.trim(),
    'Nama gelombang wajib, maksimal 160 karakter.',
  );
  const pair = config.packageIds ?? [config.originalPackageId, config.variantPackageId];
  if (config.packageIds && (config.originalPackageId || config.variantPackageId))
    assert(
      pair.length === 2 &&
        pair.includes(config.originalPackageId) &&
        pair.includes(config.variantPackageId),
      'Konfigurasi paket lama dan baru bertentangan.',
    );
  assert(
    Array.isArray(pair) &&
      pair.length >= 1 &&
      pair.length <= 5 &&
      new Set(pair).size === pair.length &&
      pair.every((id) => uuid.test(id)),
    'Pilih 1-5 UUID paket unik.',
  );
  for (const value of [config.startsAt, config.closesAt])
    assert(
      typeof value === 'string' &&
        /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        Number.isFinite(Date.parse(value)),
      'Jadwal wajib ISO8601 dengan zona waktu.',
    );
  assert(
    Date.parse(config.startsAt) < Date.parse(config.closesAt),
    'Jadwal tutup harus setelah mulai.',
  );
  assert(
    Array.isArray(config.schools) &&
      config.schools.length <= 1000 &&
      (config.schools.length > 0 || config.mandiriPackageIds?.length > 0),
    'Daftar sekolah wajib.',
  );
  const mandiriIds = config.mandiriPackageIds ?? [];
  assert(
    Array.isArray(mandiriIds) &&
      mandiriIds.length <= 5 &&
      new Set(mandiriIds).size === mandiriIds.length &&
      mandiriIds.every((id) => pair.includes(id)),
    'Subset Mandiri tidak valid.',
  );
  assert(
    config.schools.every((s) =>
      typeof s === 'string'
        ? !!s.trim() && `TRY OUT TKA ${s}`.length <= 160
        : s &&
          uuid.test(s.schoolId) &&
          typeof s.name === 'string' &&
          s.name.trim() &&
          (!s.packageIds ||
            (Array.isArray(s.packageIds) &&
              s.packageIds.length > 0 &&
              new Set(s.packageIds).size === s.packageIds.length &&
              s.packageIds.every((id) => pair.includes(id)))),
    ),
    'Nama sekolah tidak sah.',
  );
  assert(
    new Set(config.schools.map((s) => (typeof s === 'string' ? normalize(s) : s.schoolId))).size ===
      config.schools.length,
    'Sekolah duplikat.',
  );

  // Preflight every school and existing batch before the first mutation.
  const options = await api(`${base}/options?limit=100&offset=0`);
  assert(
    Array.isArray(options.waves),
    'API belum mendukung gelombang; pasang migrasi dan kode terbaru.',
  );
  const packages = await pages(api, `${base}/options`, 'packages', 'packageTotal');
  const schools = await pages(api, `${base}/options`, 'schools', 'schoolTotal');
  const batches = await pages(api, base, 'items', 'total');
  const selected = pair.map((id) => packages.find((p) => p.id === id));
  assert(
    selected.every((p) => p?.valid && p.status === 'PUBLISHED'),
    'Semua paket harus terbit dan lengkap.',
  );

  const waves = options.waves.filter((w) => normalize(w.title) === normalize(config.waveTitle));
  assert(waves.length <= 1, 'Nama gelombang ambigu.');
  let waveId = waves[0]?.id;
  if (waveId)
    assert(
      (
        waves[0].packages?.map((p) => p.id) ??
        [waves[0].originalPackageId, waves[0].variantPackageId].filter(Boolean)
      ).length === pair.length &&
        pair.every((id) =>
          (
            waves[0].packages?.map((p) => p.id) ?? [
              waves[0].originalPackageId,
              waves[0].variantPackageId,
            ]
          ).includes(id),
        ),
      'Pasangan gelombang existing berbeda.',
    );

  const plan = config.schools.map((target) => {
    const name = typeof target === 'string' ? target : target.name;
    const targetIds = typeof target === 'string' ? pair : (target.packageIds ?? pair);
    const matches = schools.filter((s) =>
      typeof target === 'string'
        ? normalize(s.schoolName) === normalize(name)
        : s.schoolId === target.schoolId,
    );
    assert(
      matches.length === 1 && uuid.test(matches[0].schoolId),
      `Sekolah tidak ditemukan atau ambigu: ${name}`,
    );
    const title = `TRY OUT TKA ${name}`;
    const existing = batches.filter((b) => normalize(b.title) === normalize(title));
    assert(existing.length <= 1, `Batch duplikat: ${title}`);
    const batch = existing[0];
    if (batch) {
      assert(
        waveId &&
          batch.waveId === waveId &&
          ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED'].includes(batch.state),
        `Gelombang/status batch existing berbeda: ${title}`,
      );
      assert(
        Date.parse(batch.startsAt) === Date.parse(config.startsAt) &&
          Date.parse(batch.closesAt) === Date.parse(config.closesAt),
        `Jadwal batch existing berbeda: ${title}`,
      );
      assert(
        batch.packages.length === pair.length &&
          pair.every((id) => batch.packages.some((p) => p.id === id)) &&
          batch.mandiriPackageId === null,
        `Paket/penerima existing berbeda: ${title}`,
      );
      const [school] = batch.schools;
      assert(
        batch.schools.length === 1 &&
          school.schoolId === matches[0].schoolId &&
          (school.packageIds ?? [school.packageId, school.variantPackageId].filter(Boolean))
            .length === targetIds.length &&
          targetIds.every((id) =>
            (school.packageIds ?? [school.packageId, school.variantPackageId]).includes(id),
          ),
        `Delegasi existing berbeda: ${title}`,
      );
    }
    return { title, schoolId: matches[0].schoolId, batch, packageIds: targetIds };
  });
  if (mandiriIds.length) {
    const title = config.mandiriTitle ?? `TRY OUT TKA UMUM ${config.waveTitle}`;
    assert(
      typeof title === 'string' && title.trim() && title.length <= 160,
      'Judul batch Mandiri tidak valid.',
    );
    const existing = batches.filter((b) => normalize(b.title) === normalize(title));
    assert(existing.length <= 1, 'Batch Mandiri ambigu.');
    const batch = existing[0];
    if (batch) {
      const ids = batch.mandiriPackageIds ?? (batch.mandiriPackageId ? pair : []);
      assert(
        waveId &&
          batch.waveId === waveId &&
          ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED'].includes(batch.state) &&
          Date.parse(batch.startsAt) === Date.parse(config.startsAt) &&
          Date.parse(batch.closesAt) === Date.parse(config.closesAt) &&
          !batch.schools.length &&
          batch.packages.length === pair.length &&
          pair.every((id) => batch.packages.some((p) => p.id === id)) &&
          ids.length === mandiriIds.length &&
          mandiriIds.every((id) => ids.includes(id)),
        'Konfigurasi batch Mandiri existing berbeda.',
      );
    }
    plan.push({ title, schoolId: null, batch, packageIds: mandiriIds });
  }
  if (plan.some((p) => !p.batch || p.batch.state === 'DRAFT'))
    assert(
      Date.parse(config.closesAt) > now,
      'Waktu tutup sudah lewat; jadwal tidak diubah otomatis.',
    );
  if (!apply)
    return plan.map((p) => ({
      title: p.title,
      schoolId: p.schoolId,
      action: !p.batch ? 'CREATE_AND_PUBLISH' : p.batch.state === 'DRAFT' ? 'PUBLISH' : 'SKIP',
      id: p.batch?.id,
    }));

  const results = [];
  for (const item of plan) {
    let batch = item.batch;
    if (!batch) {
      const created = await api(base, {
        title: item.title,
        startsAt: config.startsAt,
        closesAt: config.closesAt,
        packageIds: pair,
        ...(item.schoolId ? { mandiriPackageId: null } : { mandiriPackageIds: item.packageIds }),
        ...(waveId ? { waveId } : { newWaveTitle: config.waveTitle }),
        schools: item.schoolId
          ? [
              {
                schoolId: item.schoolId,
                ...(config.packageIds
                  ? { packageIds: item.packageIds }
                  : {
                      packageId: pair[0],
                      variantPackageId: pair[1],
                      allocationMode: 'BALANCED_50_50',
                    }),
              },
            ]
          : [],
      });
      assert(
        uuid.test(created.id),
        'API tidak mengembalikan ID batch. Hentikan; jalankan ulang untuk rekonsiliasi.',
      );
      batch = await api(`${base}/${created.id}`);
      assert(uuid.test(batch.waveId), 'ID gelombang tidak sah.');
      waveId = batch.waveId;
    }
    if (batch.state === 'DRAFT') {
      await api(`${base}/${batch.id}/publish`, { expectedRevision: batch.revision });
      batch = await api(`${base}/${batch.id}`);
    }
    assert(
      ['SCHEDULED', 'OPEN', 'CLOSED'].includes(batch.state),
      `Publikasi belum terverifikasi: ${item.title}`,
    );
    const result = { title: item.title, id: batch.id, waveId, state: batch.state };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  return results;
}

async function main() {
  const { values } = parseArgs({
    options: { config: { type: 'string' }, apply: { type: 'boolean', default: false } },
  });
  assert(values.config, 'Gunakan --config <file.json> [--apply]. Tanpa --apply hanya preview.');
  const config = JSON.parse(await readFile(values.config, 'utf8'));
  const url = new URL(process.env.NUMORA_API_URL);
  assert(
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/api\/v1\/?$/.test(url.pathname),
    'NUMORA_API_URL wajib HTTPS /api/v1; HTTP hanya localhost.',
  );
  const token = process.env.NUMORA_ADMIN_ACCESS_TOKEN;
  assert(
    token && !/\s/.test(token),
    'NUMORA_ADMIN_ACCESS_TOKEN diperlukan dari sesi Admin CONTENT_MANAGE.',
  );
  const api = async (path, body) => {
    const response = await fetch(`${url.href.replace(/\/$/, '')}/${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(
        `API ${body ? 'POST' : 'GET'} ${path}: HTTP ${response.status}. Proses berhenti; cek Admin lalu jalankan ulang.`,
      );
    return response.json();
  };
  // ponytail: one VPS operator; use server idempotency keys if provisioning spans hosts.
  await mkdir('.tmp', { recursive: true });
  const lockPath = '.tmp/tryout-provision.lock';
  const lock = await open(lockPath, 'wx');
  try {
    await lock.writeFile(String(process.pid));
    const result = await provision(config, api, { apply: values.apply });
    if (!values.apply) console.log(JSON.stringify(result, null, 2));
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
