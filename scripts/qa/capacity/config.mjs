import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { isDeepStrictEqual } from 'node:util';
import {
  assessmentFor,
  assessmentOperations,
  identity,
  productionReads,
  productionWrites,
  publicAssets,
  readJourneys,
} from '../../../qa/performance/catalog.mjs';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{40}$/i;
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const productionHosts = new Set(['hellonumora.com', 'api.hellonumora.com']);
const cohorts = ['browse', 'drill', 'tryout', 'pretest', 'pvp', 'teacher', 'admin'];
const adminRoles = ['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'];

export const budgets = { read: 750, write: 1000, submit: 2000, pvp: 1000 };

const assert = (provided, message) => {
  if (!provided) throw new Error(message);
};

const data = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

export function targetOrigin(value, environment) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('A target origin is missing or malformed');
  }
  assert(
    !target.username &&
      !target.password &&
      target.pathname === '/' &&
      !target.search &&
      !target.hash,
    'Use bare target origins',
  );
  if (environment === 'dev') {
    assert(
      loopback.has(target.hostname) && ['http:', 'https:'].includes(target.protocol),
      'Development must use loopback',
    );
  } else {
    assert(target.protocol === 'https:' && !target.port, 'Remote targets require standard HTTPS');
    assert(
      !loopback.has(target.hostname) && !isIP(target.hostname),
      'Remote targets require a domain',
    );
    assert(
      productionHosts.has(target.hostname) === (environment === 'prod'),
      'Target host does not match environment',
    );
  }
  return target.origin;
}

export function workload(environment, suite) {
  const plateau = (students, seconds) => ({ name: 'users-' + students, students, seconds });
  assert(['dev', 'staging', 'prod'].includes(environment), 'Invalid environment');
  if (environment === 'prod') {
    assert(
      ['smoke', 'load'].includes(suite),
      'Production is limited to smoke and progressive load',
    );
    return suite === 'smoke'
      ? [plateau(5, 60)]
      : [
          plateau(5, 60),
          plateau(100, 300),
          plateau(250, 300),
          plateau(500, 600),
          plateau(750, 600),
          plateau(1000, 1800),
        ];
  }
  if (environment === 'dev') {
    assert(
      [
        'smoke',
        'load',
        'stress',
        'pvp',
        'drill-smoke',
        'drill-capacity',
        'drill-scale',
        'drill-steady',
        'mixed-local',
      ].includes(suite),
      'Use staging for this suite',
    );
    if (suite === 'drill-smoke') return [plateau(5, 210)];
    if (suite === 'drill-capacity') return [plateau(100, 300), plateau(250, 300)];
    if (suite === 'drill-scale') return [250, 500, 1000].map((n) => plateau(n, 300));
    if (suite === 'drill-steady') return [plateau(1000, 360)];
    if (suite === 'mixed-local') return [20, 100, 500, 1000].map((n) => plateau(n, 150));
    if (suite === 'load') return [10, 25, 50, 100].map((n) => plateau(n, 60));
    if (suite === 'stress') return [plateau(250, 60)];
    if (suite === 'pvp') return [plateau(2, 90)];
    return [plateau(5, 30)];
  }
  if (suite === 'smoke') return [plateau(5, 60)];
  if (suite === 'load') return [plateau(100, 600), plateau(500, 600), plateau(1000, 1800)];
  if (suite === 'stress') return [plateau(1250, 600), plateau(1500, 600)];
  if (suite === 'soak') return [plateau(1000, 7200)];
  if (suite === 'pvp') return [plateau(100, 180), plateau(500, 300), plateau(1000, 600)];
  assert(
    ['spike', 'spike-tryout-start', 'spike-tryout-submit', 'spike-drill-submit'].includes(suite),
    'Unknown staging suite',
  );
  return [{ name: suite, students: 1000, seconds: suite === 'spike' ? 360 : 300 }];
}

export function validateOperation(operation, contracts) {
  assert(typeof operation === 'string', 'Operation must be a method and contract path');
  if (operation === 'GET /' || operation === publicAssets) return;
  const [method, path, extra] = operation.split(' ');
  assert(
    !extra &&
      /^(GET|POST|PATCH|PUT|DELETE)$/.test(method || '') &&
      /^\/api\/v1\/[A-Za-z0-9/{}/_-]+(?:\?[A-Za-z0-9_=&{}-]+)?$/.test(path || ''),
    'Operation must be a canonical API contract path',
  );
  assert(
    contracts.paths[path.split('?')[0]]?.[method.toLowerCase()],
    'Operation missing from OpenAPI: ' + operation,
  );
  assert(!/\/health|\/internal\//.test(path), 'Health/monitoring routes are reserved');
}

export function authorizeRemote(config, environment, suite, phases, operations, now = Date.now()) {
  const authorization = config.authorization;
  assert(
    authorization?.reference && authorization.operator && authorization.monitored === true,
    'Remote execution requires an operator, change reference and monitored run',
  );
  const begins = Date.parse(authorization.startsAt);
  const ends = Date.parse(authorization.endsAt);
  const seconds = phases.reduce((sum, phase) => sum + phase.seconds + 30, 0);
  assert(
    begins <= now && now + (seconds + 120) * 1000 <= ends,
    'Execution does not fit the approved window',
  );
  assert(
    ['web', 'api', 'worker'].every((part) => config.deployment[part] === authorization.sha),
    'Approval must match the deployed web/API/worker SHA',
  );
  assert(
    authorization.maxStudents >=
      Math.max(...phases.map((phase) => phase.students)) + (suite.startsWith('spike-') ? 100 : 0),
    'Approved student cap would be exceeded',
  );
  assert(authorization.suites?.includes(suite), 'Suite is outside the approved window');
  if (environment === 'staging') {
    assert(
      authorization.isolated === true && authorization.backupEvidence,
      'Staging isolation and restore evidence required',
    );
    if (suite !== 'smoke')
      assert(authorization.smokeEvidence, 'Passing staging smoke evidence required');
    if (suite === 'stress' || suite === 'soak')
      assert(authorization.targetLoadEvidence, 'Passing target load evidence required');
  }
  if (environment === 'prod') {
    assert(
      authorization.stagingPass && authorization.greenCi && authorization.stopOwner,
      'Production requires same-SHA staging, green CI and a stop owner',
    );
    const approved = new Set(authorization.operations);
    const isolated = new Set(authorization.isolation?.operations);
    const impact = authorization.isolation;
    for (const operation of operations) {
      assert(
        approved.has(operation),
        'Operation is outside the approved production list: ' + operation,
      );
      if (productionReads.has(operation)) continue;
      assert(
        productionWrites.has(operation) &&
          isolated.has(operation) &&
          impact.evidence &&
          ['leaderboards', 'irt', 'analytics', 'notifications', 'publicContent'].every(
            (key) => impact[key] === true,
          ),
        'Business effects require isolation for: ' + operation,
      );
    }
  }
}

export function prepare(
  config,
  suites,
  environment,
  suite,
  contracts,
  { execute = false, now = Date.now() } = {},
) {
  const web = targetOrigin(config.web, environment);
  const api = targetOrigin(config.api, environment);
  assert(
    environment !== 'prod' ||
      (web === 'https://hellonumora.com' && api === 'https://api.hellonumora.com'),
    'Production requires the published web and API origins',
  );
  assert(
    ['web', 'api', 'worker'].every((part) => sha.test(config.deployment?.[part] || '')) &&
      new Set(Object.values(config.deployment)).size === 1,
    'Web, API and worker must pin a single 40-character SHA',
  );

  const phases = workload(environment, suite);
  const assessmentWrites = config.assessmentWrites ?? [];
  if (['drill-smoke', 'drill-capacity', 'drill-scale', 'drill-steady'].includes(suite))
    assert(
      assessmentWrites.length === 1 && assessmentWrites.includes('drill'),
      'Drill diagnostics require only Drill writes',
    );
  assert(
    Array.isArray(assessmentWrites) &&
      assessmentWrites.every((key) => ['drill', 'tryout', 'pretest'].includes(key)),
    'Choose supported assessment write journeys',
  );
  if (suite.startsWith('spike-')) {
    const assessment = suite.split('-')[1];
    assert(assessmentWrites.includes(assessment), 'Spike requires the matching assessment writes');
  }
  assert(
    config.pvp === undefined || typeof config.pvp === 'boolean',
    'PvP configuration must be boolean',
  );
  const extras = config.extraJourneys ?? {};
  const assets = config.assets ?? [];
  if (suite === 'mixed-local') assert(config.pvp === true, 'Local mixed rehearsal requires PvP');
  if (
    suite === 'mixed-local' ||
    (execute && environment === 'staging' && ['load', 'soak', 'stress', 'spike'].includes(suite))
  ) {
    assert(
      ['drill', 'tryout', 'pretest'].every((key) => assessmentWrites.includes(key)),
      'Full staging workload requires all three assessment journeys',
    );
  }
  assert(
    environment !== 'prod' || (Object.keys(extras).length === 0 && !config.pvp),
    'Production extras and WebSocket matches are outside the implemented allowlist',
  );
  assert(suite !== 'pvp' || config.pvp === true, 'PvP must be enabled on the target');
  const operations = new Set([identity, ...Object.values(readJourneys).flat()]);
  if (assets.length) operations.add(publicAssets);
  assert(
    Array.isArray(assets) &&
      assets.length <= 10 &&
      assets.every(
        (path) =>
          /^\/_next\/static\/[a-zA-Z0-9_./-]+$/.test(path) &&
          !path.includes('..') &&
          !path.includes('//'),
      ),
    'Assets must be explicit Next.js static paths',
  );
  for (const key of assessmentWrites) {
    for (const operation of assessmentOperations(key, suite)) operations.add(operation);
  }
  if (assessmentWrites.includes('drill'))
    operations.add('PATCH /api/v1/assessment-attempts/{attemptId}/drill-clock');
  for (const [cohort, steps] of Object.entries(extras)) {
    assert(
      cohorts.includes(cohort) && Array.isArray(steps) && steps.length <= 20,
      'Invalid extra journey',
    );
    for (const step of steps) {
      validateOperation(step.operation, contracts);
      assert(
        Number.isInteger(step.status) && step.status >= 200 && step.status <= 499,
        'Extra steps require explicit expected HTTP status',
      );
      assert(
        step.adminRole === undefined || (cohort === 'admin' && adminRoles.includes(step.adminRole)),
        'Only admin extras may select an Admin subrole',
      );
      operations.add(step.operation);
    }
  }
  for (const operation of operations) validateOperation(operation, contracts);
  if (execute && environment !== 'dev')
    authorizeRemote(config, environment, suite, phases, operations, now);
  if (execute) assert(suites && typeof suites === 'object', 'An actor file is required');
  return {
    environment,
    suite,
    phases,
    web,
    api,
    assessmentWrites,
    operations: [...operations],
    extras,
    assets,
    pvp: !!config.pvp && suite !== 'spike',
    budgets,
  };
}

export function countsFor(phase, plan) {
  if (['drill-smoke', 'drill-capacity', 'drill-scale', 'drill-steady'].includes(plan.suite))
    return { drill: phase.students };
  if (plan.suite === 'pvp') return { pvp: phase.students };
  if (plan.suite.startsWith('spike-')) {
    return { [plan.suite.split('-')[1]]: phase.students, browse: 100, teacher: 20, admin: 6 };
  }
  const count = phase.students;
  const counts = {
    drill: Math.floor(count * 0.35),
    tryout: Math.floor(count * 0.3),
    pretest: Math.ceil(count * 0.1),
    pvp: plan.pvp ? 2 * Math.floor((count * 0.15) / 2) : 0,
    teacher: count >= 100 ? 20 : 1,
    admin: count >= 100 ? 6 : 1,
  };
  counts.browse = count - counts.drill - counts.tryout - counts.pretest - counts.pvp;
  return counts;
}

export function phaseActors(actorFile, phase, plan) {
  const available = actorFile.phases?.[phase.name];
  assert(available, 'Missing actor cohort for ' + phase.name);
  const identities = new Set();
  const secrets = new Set();
  const needed = countsFor(phase, plan);
  return Object.fromEntries(
    Object.entries(needed)
      .filter(([, count]) => count > 0)
      .map(([role, count]) => {
        assert(
          Array.isArray(available[role]) && available[role].length === count,
          phase.name + ' requires exactly ' + count + ' ' + role + ' actors',
        );
        const actors = available[role].map((actor) => {
          assert(
            uuid.test(actor.id || '') &&
              typeof actor.token === 'string' &&
              /^[a-zA-Z0-9._~-]{4,8192}$/.test(actor.token) &&
              !identities.has(actor.id.toLowerCase()) &&
              !secrets.has(actor.token),
            'Actors need unique UUIDs and session tokens',
          );
          identities.add(actor.id.toLowerCase());
          secrets.add(actor.token);
          assert(
            ['school', 'mandiri'].includes(actor.affiliation) ||
              ['teacher', 'admin'].includes(role),
            'Student affiliation must be pinned as school or mandiri',
          );
          if (actor.affiliation === 'school')
            assert(uuid.test(actor.vars?.classId || ''), 'School students require class ID');
          if (role === 'admin' && plan.environment !== 'dev') {
            assert(
              adminRoles.includes(actor.adminRole),
              'Admin actor requires its current subrole',
            );
          }
          const extraSteps = (plan.extras[role] ?? []).filter(
            (step) => !step.adminRole || actor.adminRole === step.adminRole,
          );
          const paths = [
            ...(readJourneys[role] ?? []),
            ...extraSteps.map((step) => step.operation),
          ];
          if (plan.assessmentWrites.includes(role)) {
            paths.push(assessmentOperations(role, plan.suite)[0]);
            if (role !== 'drill') paths.push(...readJourneys.browse);
          }
          if (plan.assessmentWrites.includes(role)) {
            const required = assessmentFor(role, plan.suite).parameter ?? 'batchId';
            assert(
              uuid.test(actor.vars?.[required] || ''),
              'Assessment requires fixture ' + required,
            );
          }
          for (const path of paths) {
            for (const [, key] of path.matchAll(/\{(\w+)\}/g)) {
              assert(uuid.test(actor.vars?.[key] || ''), 'Missing UUID fixture field: ' + key);
            }
          }
          if (plan.suite.endsWith('-submit') && plan.suite.split('-')[1] === role) {
            assert(
              uuid.test(actor.vars?.attemptId || ''),
              'Submit spikes need pre-populated attempts',
            );
          }
          return actor;
        });
        if (role === 'admin' && count === 6 && plan.environment !== 'dev') {
          assert(
            adminRoles.every(
              (key) => actors.filter((actor) => actor.adminRole === key).length === 2,
            ),
            'Six-admin phases require two accounts per Admin subrole',
          );
        }
        return [role, actors];
      }),
  );
}

export function refreshPhaseActors(fixtures, phase, plan, initial, now = Date.now()) {
  const refreshed = phaseActors(fixtures, phase, plan);
  const withoutSecrets = (mapping) =>
    Object.fromEntries(
      Object.entries(mapping).map(([role, list]) => [
        role,
        list.map((actor) => ({ ...actor, token: null })),
      ]),
    );
  assert(
    isDeepStrictEqual(withoutSecrets(refreshed), withoutSecrets(initial)),
    'Only token rotation is permitted in the actor file between stages',
  );
  if (plan.environment === 'dev') return refreshed;
  const minimum = now / 1000 + phase.seconds + 35;
  for (const actor of Object.values(refreshed).flat()) {
    let exp;
    try {
      if (actor.token.split('.').length === 3) {
        exp = JSON.parse(Buffer.from(actor.token.split('.')[1], 'base64url').toString('utf8')).exp;
      }
    } catch {
      /* Expiry must be present for remote credentials. */
    }
    assert(
      Number.isFinite(exp) && exp >= minimum,
      'A session will expire before the projected end of this stage',
    );
  }
  return refreshed;
}
export { data };
