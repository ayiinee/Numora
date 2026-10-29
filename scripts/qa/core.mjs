import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import Ajv from 'ajv';

export const ROLES = ['siswa', 'guru', 'admin', 'cross-role'];
export const PROFILES = { quick: 0, standard: 1, full: 2 };
export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function inside(root, path) {
  if (
    typeof path !== 'string' ||
    !path ||
    isAbsolute(path) ||
    /^[A-Za-z]:|\\/.test(path) ||
    path.split('/').includes('..')
  )
    throw new Error('PATH_OUTSIDE_REPOSITORY');
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(resolve(root) + sep))
    throw new Error('PATH_OUTSIDE_REPOSITORY');
  if (existsSync(target)) {
    const real = realpathSync(target);
    if (real !== realpathSync(root) && !real.startsWith(realpathSync(root) + sep))
      throw new Error('SYMLINK_OUTSIDE_REPOSITORY');
  }
  return target;
}
export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.tmp-' + uuid();
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  replaceAtomically(temporary, path);
}
export function replaceAtomically(temporary, target, rename = renameSync) {
  for (let attempt = 0; ; attempt++) {
    try {
      rename(temporary, target);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 8) throw error;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        Math.min(25 * 2 ** attempt, 250),
      );
    }
  }
}
export function sanitize(value) {
  return String(value)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/(postgres(?:ql)?|rediss?):\/\/[^\s"'<>]+/gi, '$1://[REDACTED]')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]')
    .replace(
      /((?:access_token|refresh_token|password|secret|authorization|api[_-]?key|token)\s*["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
}
export function validateSchema(root, name, value) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(readJson(inside(root, 'qa/schemas/' + name + '.schema.json')));
  if (!validate(value))
    throw new Error('INVALID_' + name.toUpperCase() + ': ' + ajv.errorsText(validate.errors));
}
export function discover(root) {
  const found = [];
  function visit(folder) {
    if (!existsSync(folder)) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (['reports', '.local', 'node_modules'].includes(entry.name) || entry.isSymbolicLink())
        continue;
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === 'scenario.json')
        found.push({ ...readJson(path), manifestPath: relative(root, path).replaceAll('\\', '/') });
    }
  }
  visit(resolve(root, 'qa/scenarios'));
  return found.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}
export function validateScenario(root, scenario) {
  const { manifestPath, ...manifest } = scenario;
  validateSchema(root, 'scenario', manifest);
  if (!manifestPath.startsWith('qa/scenarios/' + scenario.role + '/'))
    throw new Error('SCENARIO_ROLE_PATH_MISMATCH');
  const prefixes = { siswa: 'SIS', guru: 'GRU', admin: 'ADM', 'cross-role': 'XROLE' };
  if (!scenario.id.startsWith(prefixes[scenario.role] + '-'))
    throw new Error('SCENARIO_ROLE_ID_MISMATCH');
  const ids = new Set(),
    sources = new Set();
  for (const source of scenario.sources) {
    if (sources.has(source.id)) throw new Error('DUPLICATE_SOURCE_ID');
    sources.add(source.id);
    if (!existsSync(inside(root, source.path))) throw new Error('SOURCE_NOT_FOUND: ' + source.path);
  }
  for (const check of scenario.checks) {
    if (ids.has(check.id)) throw new Error('DUPLICATE_CHECK_ID');
    ids.add(check.id);
    for (const file of check.files)
      if (!existsSync(inside(root, file))) throw new Error('TEST_FILE_NOT_FOUND: ' + file);
    if (
      ['vitest-domain', 'vitest-web', 'vitest-api', 'playwright', 'accessibility'].includes(
        check.adapter,
      ) &&
      !check.files.length
    )
      throw new Error('EMPTY_TEST_SELECTION: ' + check.id);
  }
  const cases = new Set(),
    referenced = new Set();
  for (const item of scenario.cases) {
    if (cases.has(item.id)) throw new Error('DUPLICATE_CASE_ID');
    cases.add(item.id);
    if (!sources.has(item.source)) throw new Error('CASE_SOURCE_NOT_FOUND: ' + item.id);
    if (item.applicability === 'not-applicable' && !item.reason)
      throw new Error('APPLICABILITY_REASON_REQUIRED');
    for (const id of item.checks) {
      if (!ids.has(id)) throw new Error('CHECK_REFERENCE_NOT_FOUND: ' + id);
      if (item.applicability !== 'not-applicable') referenced.add(id);
    }
  }
  for (const check of scenario.checks)
    if (
      !referenced.has(check.id) &&
      !scenario.cases.some(
        (item) => item.checks.includes(check.id) && item.applicability === 'not-applicable',
      )
    )
      throw new Error('ORPHAN_CHECK: ' + check.id);
  return scenario;
}
export function loadScenario(root, id) {
  const all = discover(root),
    matches = all.filter((s) => s.id === id);
  if (matches.length !== 1)
    throw new Error(matches.length ? 'DUPLICATE_SCENARIO_ID' : 'SCENARIO_NOT_FOUND');
  return validateScenario(root, matches[0]);
}
export function hashFiles(root, files) {
  return digest(
    [...new Set(files)]
      .sort()
      .map((file) => {
        const path = inside(root, file);
        return file + '\0' + (existsSync(path) ? digest(readFileSync(path)) : 'MISSING');
      })
      .join('\n'),
  );
}
export function identity(root, scenario) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    .split('\0')
    .filter(
      (p) =>
        p &&
        !p.includes('/reports/') &&
        !p.startsWith('qa/.local/') &&
        !p.startsWith('docs/') &&
        !p.startsWith('outputs/') &&
        !p.startsWith('.env') &&
        !p.endsWith('.log'),
    );
  const config = readJson(inside(root, 'qa/config.json'));
  return {
    sha: git('rev-parse', 'HEAD').trim(),
    dirty: Boolean(git('status', '--porcelain', '--untracked-files=normal').trim()),
    codeHash: hashFiles(root, files),
    rulesHash: hashFiles(root, [...config.rules, ...scenario.sources.map((s) => s.path)]),
    configHash: digest(readFileSync(inside(root, 'qa/config.json'))),
    environmentHash: hashFiles(root, ['.env.test.local']),
    manifestHash: digest(readFileSync(inside(root, scenario.manifestPath))),
  };
}
export function sameIdentity(a, b) {
  return ['sha', 'codeHash', 'rulesHash', 'configHash', 'manifestHash', 'environmentHash'].every(
    (k) => a[k] === b[k],
  );
}
export function enforceMinimum(check, outcome) {
  if (
    outcome.status === 'PASS' &&
    (!Number.isInteger(outcome.observedTests) || outcome.observedTests < check.minimumTests)
  )
    return { ...outcome, status: 'BLOCKED', reason: 'INSUFFICIENT_EVIDENCE_COUNT' };
  return outcome;
}
export function newSession(root, role) {
  if (!ROLES.includes(role)) throw new Error('INVALID_ROLE');
  const time = now();
  const session = {
    schemaVersion: 1,
    id: uuid(),
    role,
    phase: 'STARTED',
    scenarioId: null,
    runId: null,
    profile: 'standard',
    createdAt: time,
    updatedAt: time,
  };
  saveSession(root, session);
  return session;
}
export function saveSession(root, session) {
  session.updatedAt = now();
  validateSchema(root, 'session', session);
  writeJson(inside(root, 'qa/.local/sessions/' + session.id + '.json'), session);
}
export function loadSession(root, id, role) {
  const directory = inside(root, 'qa/.local/sessions');
  const sessions = existsSync(directory)
    ? readdirSync(directory)
        .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
        .map((n) => readJson(resolve(directory, n)))
        .filter((s) => (!id || s.id === id) && (!role || s.role === role))
    : [];
  if (sessions.length !== 1)
    throw new Error(
      sessions.length
        ? 'AMBIGUOUS_SESSION: choose --session from ' +
            sessions.map((s) => s.id + ' (' + s.role + ')').join(', ')
        : 'SESSION_NOT_FOUND: use start --role',
    );
  validateSchema(root, 'session', sessions[0]);
  return sessions[0];
}
export function resultPath(root, scenario, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('INVALID_RUN_ID');
  return inside(
    root,
    dirname(scenario.manifestPath).replaceAll('\\', '/') + '/reports/' + id + '/result.json',
  );
}
export function summarize(checks, profile) {
  const selected = checks.filter(
    (c) => c.required !== false && PROFILES[c.profile] <= PROFILES[profile],
  );
  if (!selected.length) return 'INCOMPLETE';
  if (selected.some((c) => c.status === 'FAIL')) return 'FAIL';
  if (selected.some((c) => c.status === 'BLOCKED')) return 'BLOCKED';
  if (selected.some((c) => c.status !== 'PASS')) return 'INCOMPLETE';
  return 'PASS';
}
export function evaluateEvidence(exitCode, parsed, minimumTests) {
  if (!parsed || typeof parsed !== 'object')
    return { status: 'BLOCKED', reason: 'MISSING_OR_INVALID_MACHINE_EVIDENCE', observedTests: 0 };
  const passed = Number(parsed.passed ?? parsed.numPassedTests ?? 0);
  const failed = Number(parsed.failed ?? parsed.numFailedTests ?? 0);
  const skipped =
    Number(parsed.skipped ?? parsed.numPendingTests ?? 0) + Number(parsed.numTodoTests ?? 0);
  const blocked = Number(parsed.blocked ?? 0);
  const total = Number(parsed.total ?? parsed.numTotalTests ?? passed + failed + skipped);
  if (
    ![passed, failed, skipped, blocked, total].every((n) => Number.isInteger(n) && n >= 0) ||
    passed + failed + skipped + blocked !== total
  )
    return { status: 'BLOCKED', reason: 'INCONSISTENT_MACHINE_EVIDENCE', observedTests: 0 };
  if (failed)
    return { status: 'FAIL', reason: 'ASSERTION_OR_RUNNER_FAILURE', observedTests: total };
  if (blocked)
    return { status: 'BLOCKED', reason: 'EXPERIMENT_BOUND_REACHED', observedTests: total };
  if (exitCode !== 0)
    return {
      status: total > 0 ? 'FAIL' : 'BLOCKED',
      reason: 'RUNNER_FAILURE',
      observedTests: total,
    };
  if (skipped) return { status: 'BLOCKED', reason: 'REQUIRED_TESTS_SKIPPED', observedTests: total };
  if (passed < minimumTests)
    return { status: 'BLOCKED', reason: 'INSUFFICIENT_EXECUTED_TESTS', observedTests: total };
  return { status: 'PASS', reason: null, observedTests: total };
}
export function writeReport(root, scenario, result, options = {}) {
  validateSchema(root, 'result', result);
  const path = resultPath(root, scenario, result.id);
  if (options.persistResult !== false) writeJson(path, result);
  const rows = result.checks.map(
    (c) =>
      '| ' +
      c.id +
      ' | ' +
      c.status +
      ' | ' +
      c.observedTests +
      ' | ' +
      c.evidence +
      ' | ' +
      sanitize(c.reason || '') +
      ' |',
  );
  const lines = [
    '# ' + scenario.id + ' — ' + scenario.title,
    '',
    'Run: ' + result.id,
    'Role: ' + result.role + ' · Profil: ' + result.profile,
    'Mulai UTC: ' + result.startedAt,
    'Selesai UTC: ' + (result.finishedAt || 'belum selesai'),
    'Waktu WIB: ' +
      new Date(result.startedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    'Commit: ' + result.identity.sha + ' · Perubahan lokal: ' + result.identity.dirty,
    'Fingerprint kode: ' + result.identity.codeHash,
    'Fingerprint aturan: ' + result.identity.rulesHash,
    '',
    '**Hasil profil: ' + result.verdict + '**',
    '**Penerimaan lengkap skenario: ' + summarize(result.checks, 'full') + '**',
    '',
    '| Pemeriksaan | Status | Tes teramati | Jenis bukti | Keterangan |',
    '| --- | --- | ---: | --- | --- |',
    ...rows,
    '',
    '## Batas kesimpulan',
    ...result.limitations.map((l) => '- ' + l),
    '',
    '## Pemeriksaan manual',
    ...Object.entries(result.manualReviews || {}).map(
      ([id, item]) =>
        '- ' +
        id +
        ': ' +
        item.status +
        ' — reviewer ' +
        item.reviewer +
        ', ' +
        item.at +
        ': ' +
        item.note,
    ),
    '',
    '## Keterlacakan',
    ...scenario.cases.map(
      (c) =>
        '- ' +
        c.id +
        ': ' +
        c.title +
        ' → ' +
        c.checks.join(', ') +
        ' → sumber ' +
        c.source +
        ' (' +
        c.applicability +
        ')',
    ),
    '',
    '## Metrik eksperimen',
    ...result.checks
      .filter((c) => c.metrics)
      .map((c) => '- ' + c.id + ': ' + JSON.stringify(c.metrics)),
    '',
    '## Langkah berikutnya',
    ...nextActions(scenario, result).map((a) => '- ' + a),
    '',
  ];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(resolve(dirname(path), 'report.md'), sanitize(lines.join('\n')) + '\n');
  const failed = result.checks.filter((c) => c.status === 'FAIL');
  if (failed.length)
    writeFileSync(
      resolve(dirname(path), 'findings.md'),
      sanitize(
        [
          '# Temuan ' + result.id,
          '',
          ...failed.flatMap((c, i) => [
            '## BUG-' + String(i + 1).padStart(3, '0') + ' — ' + c.id,
            'Kategori: UNTRIAGED (aplikasi / tes / lingkungan / requirement). Severity: perlu triase.',
            'Versi: ' + result.identity.sha + ' / ' + result.identity.codeHash,
            'Reproduksi: pnpm qa run --scenario ' + scenario.id + ' --profile ' + result.profile,
            'Expected: pemeriksaan ' + c.id + ' memenuhi sumber dan assertion yang dipetakan.',
            'Actual: ' + c.reason + '; ' + JSON.stringify(c.counts || {}),
            ...(c.failures || []).map((item) => 'Assertion: ' + item.name + '\n' + item.reason),
            'Bukti: result.json dan artefak lokal check ' + c.id + '.',
            'Retest: NOT_RUN; hubungkan run baru setelah perubahan. Jangan menghapus bukti kegagalan awal.',
            '',
          ]),
        ].join('\n'),
      ),
    );
  writeFileSync(
    resolve(dirname(path), 'handoff.md'),
    [
      '# Lanjut QA',
      'Gunakan skill numora-qa pada repository ini.',
      'Role: ' + result.role,
      'Skenario: ' + scenario.id,
      'Run: ' + result.id,
      'Fingerprint: ' + result.identity.codeHash,
      'Hasil: ' + result.verdict,
      ...nextActions(scenario, result).map((a) => '- ' + a),
      'Jangan memakai PASS dari versi kode/aturan lain sebagai bukti versi ini.',
    ].join('\n') + '\n',
  );
  return path;
}
export function nextActions(scenario, result) {
  const actions = [];
  if (result.verdict === 'FAIL')
    actions.push('Triase findings.md; siapkan handoff ke developer dan retest setelah perubahan.');
  else if (
    result.checks.some(
      (c) =>
        c.status === 'BLOCKED' &&
        /EXPERIMENT|HARNESS_ERROR|SOURCE_CHANGED|RUNNER_FAILURE/.test(c.reason || ''),
    )
  )
    actions.push(
      'Triase bukti dan batas eksperimen pada report.md; tetapkan perbaikan atau investigasi sebelum retest.',
    );
  else if (result.checks.some((c) => c.status === 'BLOCKED'))
    actions.push('Periksa prasyarat/lingkungan: pnpm qa doctor --profile ' + result.profile);
  else if (
    result.checks.some(
      (c) =>
        c.adapter !== 'manual' &&
        c.status === 'NOT_RUN' &&
        PROFILES[c.profile] <= PROFILES[result.profile],
    )
  )
    actions.push(
      'Lanjutkan verifikasi dalam run baru: pnpm qa run --scenario ' +
        scenario.id +
        ' --profile ' +
        result.profile,
    );
  else if (
    result.checks.some(
      (c) => c.adapter !== 'manual' && c.required !== false && c.status === 'NOT_RUN',
    )
  )
    actions.push(
      'Lanjutkan cakupan: pnpm qa run --scenario ' +
        scenario.id +
        ' --profile ' +
        (result.profile === 'quick' ? 'standard' : 'full'),
    );
  else if (result.checks.some((c) => c.adapter === 'manual' && c.status !== 'PASS'))
    actions.push('Selesaikan checklist manual dan rekam bukti dengan pnpm qa manual.');
  else
    actions.push(
      'Pilih skenario berikutnya untuk role ' + scenario.role + ' melalui pnpm qa list.',
    );
  actions.push('Bagikan: pnpm qa share --scenario ' + scenario.id + ' --run ' + result.id);
  actions.push(
    'Lihat konteks dan perubahan versi melalui pnpm qa status --role ' + scenario.role + '.',
  );
  return actions.slice(0, 3);
}

export function publicationRequest(previous, input) {
  if (previous.runId && previous.runId !== input.runId) throw new Error('PUBLICATION_RUN_MISMATCH');
  return {
    ...previous,
    ...input,
    explicitAction: true,
    status:
      previous.status === 'PUBLISHED' && previous.reportHash === input.reportHash
        ? 'PUBLISHED'
        : 'PENDING_CONNECTOR',
  };
}
export function publicationReadback(request, verifiedRun, documentUrl, currentReportHash) {
  if (
    !request.explicitAction ||
    verifiedRun !== request.runId ||
    request.reportHash !== currentReportHash ||
    !/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+(?:\/.*)?$/.test(documentUrl || '')
  )
    throw new Error('PUBLICATION_REQUIRES_CURRENT_REPORT_AND_CONNECTOR_READBACK');
  return { ...request, status: 'PUBLISHED', documentUrl, verifiedAt: now() };
}
