import exec from 'k6/execution';
import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  assessmentFor,
  assessments,
  identity,
  readJourneys,
  publicAssets,
  statGroup,
  drillClock,
} from './catalog.mjs';

const { phase, plan } = JSON.parse(open(__ENV.NUMORA_CAPACITY_INPUT));
const mixedLocal = plan.suite === 'mixed-local';
const drillCapacity = ['drill-capacity', 'drill-scale', 'drill-steady', 'mixed-local'].includes(
  plan.suite,
);

function loadActors(includeRole) {
  return Object.entries(JSON.parse(open(__ENV.NUMORA_CAPACITY_ACTORS)))
    .filter(([role]) => (role !== 'pvp' || !plan.pvp) && includeRole(role))
    .flatMap(([role, cohort]) => cohort.map((actor) => ({ ...actor, role })));
}
const allowed = new Set(plan.operations);
const failures = new Rate('numora_unexpected');
const latency = new Trend('numora_duration_ms', true);
const journeys = new Rate('numora_journey_success');
const integrity = new Counter('numora_integrity_errors');
const participants = new Counter('numora_participants');
const spikes = new Counter('numora_spike_started');

const perOperation = Object.fromEntries(
  plan.operations.flatMap((key) => [
    ['numora_unexpected{op:' + plan.operations.indexOf(key) + '}', ['rate<=1']],
    ['numora_duration_ms{op:' + plan.operations.indexOf(key) + '}', ['p(95)>=0']],
    ['http_reqs{op:' + plan.operations.indexOf(key) + '}', ['count>=0']],
  ]),
);
const thresholds = {
  numora_unexpected: [{ threshold: 'rate<0.02', abortOnFail: true, delayAbortEval: '2m' }],
  numora_integrity_errors: [{ threshold: 'count==0', abortOnFail: true }],
  numora_journey_success: ['rate>=0.99'],
  dropped_iterations: ['count==0'],
  ...perOperation,
};

const targeted = plan.suite.startsWith('spike-');
const group = targeted ? plan.suite.split('-')[1] : null;
const regularActors = new SharedArray('regular actors', () => loadActors((role) => role !== group));
const targetActors = targeted
  ? new SharedArray('burst actors', () => loadActors((role) => role === group))
  : [];
const isRampSpike = plan.suite === 'spike';

export const options = {
  scenarios: {
    mixed: isRampSpike
      ? {
          executor: 'ramping-vus',
          exec: 'mixed',
          startVUs: 100,
          stages: [
            { target: 100, duration: '1m' },
            { target: regularActors.length, duration: '45s' },
            { target: regularActors.length, duration: '3m30s' },
            { target: 0, duration: '45s' },
          ],
          gracefulRampDown: '10s',
        }
      : {
          executor: 'constant-vus',
          exec: 'mixed',
          vus: regularActors.length,
          duration: phase.seconds + 's',
          gracefulStop: '20s',
        },
    ...(targeted
      ? {
          burst: {
            executor: 'constant-arrival-rate',
            exec: 'burst',
            rate: targetActors.length,
            timeUnit: '30s',
            duration: '30s',
            startTime: '60s',
            preAllocatedVUs: targetActors.length,
            gracefulStop: '20s',
          },
        }
      : {}),
  },
  thresholds,
  summaryTrendStats: ['count', 'p(50)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: true,
  maxRedirects: 0,
  systemTags: ['status', 'name', 'method', 'scenario', 'expected_response'],
};

let claimed = false;
let signedIn = false;
let assessment = null;
let finished = false;
let extrasDone = false;

export function setup() {
  console.log(JSON.stringify({ event: 'http-ready', phase: phase.name }));
}

function receipt(event, actor, detail) {
  console.log(JSON.stringify({ event, at: Date.now(), actor: actor.id, ...detail }));
}

function json(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function integrityError(actor, reason, detail = {}) {
  integrity.add(1);
  receipt('integrity', actor, { reason, ...detail });
  return false;
}

function resolvePath(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key];
    if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
      throw new Error('Invalid route fixture parameter: ' + key);
    }
    return value;
  });
}

function interpolate(value, vars) {
  if (Array.isArray(value)) return value.map((item) => interpolate(item, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolate(item, vars)]),
    );
  }
  return typeof value === 'string' && /^\{\w+\}$/.test(value) ? resolvePath(value, vars) : value;
}

function buildRequest(actor, operation, { body = null, statuses, vars = {}, parse, asset }) {
  if (!allowed.has(operation)) throw new Error('Operation denied by run profile');
  const [method, template] = operation.split(' ');
  const path = asset ?? resolvePath(template, { ...actor.vars, ...vars });
  const index = String(plan.operations.indexOf(operation));
  const origin = path.startsWith('/api/v1/') ? plan.api : plan.web;
  const headers = path.startsWith('/api/v1/')
    ? { Authorization: 'Bearer ' + actor.token, 'Content-Type': 'application/json' }
    : {};
  return {
    method,
    url: origin + path,
    body: body === null ? null : JSON.stringify(body),
    params: {
      timeout: '15s',
      redirects: 0,
      responseType: parse || drillCapacity ? 'text' : 'none',
      tags: { op: index, name: operation, group: statGroup(operation) },
      headers,
      responseCallback: http.expectedStatuses(...statuses),
    },
  };
}

function observe(response, index, statuses, parse) {
  const ok = statuses.includes(response.status);
  failures.add(!ok, { op: index });
  if (!ok && drillCapacity) {
    const candidate = json(response)?.code;
    const code =
      typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate)
        ? candidate
        : 'UNAVAILABLE';
    console.log(
      JSON.stringify({
        event: 'http-failure',
        operation: plan.operations[Number(index)],
        status: response.status,
        code,
      }),
    );
  }
  latency.add(response.timings.duration, { op: index });
  return { ok, status: response.status, payload: parse ? json(response) : null };
}

function request(actor, operation, options = {}) {
  const { parse = false, statuses = [200] } = options;
  const spec = buildRequest(actor, operation, { ...options, parse, statuses });
  return observe(
    http.request(spec.method, spec.url, spec.body, spec.params),
    spec.params.tags.op,
    statuses,
    parse,
  );
}
function signIn(actor) {
  if (signedIn) return true;
  const result = request(actor, identity, { parse: true });
  const role = ['teacher', 'admin'].includes(actor.role) ? actor.role.toUpperCase() : 'STUDENT';
  if (
    result.ok &&
    (result.payload?.id !== actor.id ||
      result.payload?.role !== role ||
      (actor.adminRole && result.payload?.adminRole !== actor.adminRole))
  )
    return integrityError(actor, 'identity-mismatch');
  signedIn = result.ok;
  return signedIn;
}

function read(actor, role) {
  const operations = readJourneys[role];
  const operation = operations[exec.vu.iterationInScenario % operations.length];
  const result = request(actor, operation);
  let ok = result.ok;
  if (operation === 'GET /') {
    for (const asset of plan.assets) ok = request(actor, publicAssets, { asset }).ok && ok;
  }
  if (
    role === 'browse' &&
    actor.affiliation === 'school' &&
    exec.vu.iterationInScenario % 4 === 0
  ) {
    ok = request(actor, readJourneys.school[0]).ok && ok;
  }
  return ok;
}

function runExtras(actor) {
  for (const step of plan.extras[actor.role] ?? []) {
    if (step.adminRole && actor.adminRole !== step.adminRole) continue;
    if (
      !request(actor, step.operation, {
        body: interpolate(step.body ?? null, actor.vars),
        statuses: [step.status],
      }).ok
    )
      return false;
  }
  return true;
}

function start(actor) {
  const definition = assessmentFor(actor.role, plan.suite);
  const body = definition.parameter
    ? { [definition.parameter]: actor.vars[definition.parameter] }
    : actor.vars.schoolId
      ? { schoolId: actor.vars.schoolId }
      : {};
  const result = request(actor, definition.start, { body, parse: true, statuses: [200, 201] });
  if (!result.ok) return null;
  const attempt = result.payload;
  if (
    !attempt?.id ||
    attempt.status !== 'inProgress' ||
    attempt.questions?.length !== definition.count
  ) {
    integrityError(actor, 'unexpected-start-payload');
    return null;
  }
  receipt('start', actor, { kind: actor.role, attemptId: attempt.id });
  return attempt;
}

function answer(question) {
  if (question.type === 'MULTIPLE_CHOICE_MULTIPLE_ANSWER') {
    return question.options?.length
      ? { optionIds: question.options.slice(0, 2).map((choice) => choice.id) }
      : null;
  }
  if (question.type === 'CATEGORY') {
    return question.options?.length && question.categories?.length
      ? {
          categoryByStatementId: Object.fromEntries(
            question.options.map((choice) => [choice.id, question.categories[0].id]),
          ),
        }
      : null;
  }
  return question.options?.[0]?.id ? { optionId: question.options[0].id } : null;
}

function sameAnswer(left, right) {
  return left?.optionId
    ? left.optionId === right?.optionId
    : left?.optionIds
      ? left.optionIds.slice().sort().join(',') === right?.optionIds?.slice().sort().join(',')
      : !!right?.categoryByStatementId &&
        Object.entries(left?.categoryByStatementId ?? {}).every(
          ([key, value]) => right.categoryByStatementId[key] === value,
        );
}

function submit(actor, attemptId, concurrent = false) {
  const path = assessments[actor.role].path;
  const vars = { attemptId };
  const operation = 'POST ' + path + '/submit';
  const statuses = [200, 201];
  const spec = buildRequest(actor, operation, { vars, statuses, parse: true });
  const results = concurrent
    ? http.batch([spec, spec])
    : [http.request(spec.method, spec.url, spec.body, spec.params)];
  const responses = results.map((result) => observe(result, spec.params.tags.op, statuses, true));
  const [response] = responses;
  const value = response.payload;
  const validates =
    actor.role === 'tryout'
      ? value?.state === 'waitingIrt' &&
        Number.isFinite(value.xp) &&
        !('score' in value) &&
        !('questions' in value)
      : value?.attemptId === attemptId &&
        Number.isFinite(value.score) &&
        (actor.role === 'drill' ? Number.isFinite(value.reward?.totalXp) : !('xp' in value));
  for (const [index, accepted] of responses.entries()) {
    receipt('submit', actor, {
      kind: actor.role,
      attemptId,
      status: accepted.status,
      score: accepted.payload?.score ?? null,
      xp: accepted.payload?.reward?.totalXp ?? accepted.payload?.xp ?? null,
      repeat: index > 0,
    });
  }
  if (responses.some((accepted) => !accepted.ok)) return false;
  if (
    responses.length > 1 &&
    (responses[1].payload?.score !== value?.score ||
      responses[1].payload?.reward?.totalXp !== value?.reward?.totalXp ||
      responses[1].payload?.xp !== value?.xp ||
      responses[1].payload?.state !== value?.state ||
      responses[1].payload?.attemptId !== value?.attemptId)
  ) {
    return integrityError(actor, 'concurrent-submit-mismatch', { attemptId });
  }
  if (!validates) return integrityError(actor, 'unexpected-submit-payload', { attemptId });
  if (actor.role === 'tryout') {
    const reread = request(actor, 'GET ' + path, { vars, parse: true });
    if (!reread.ok) return false;
    if (
      reread.payload?.status !== 'submitted' ||
      reread.payload?.xp !== value.xp ||
      reread.payload?.questions?.some(
        (question) => 'answerKey' in question || 'explanation' in question,
      )
    ) {
      return integrityError(actor, 'tryout-submission-mismatch', { attemptId });
    }
    const pending = request(actor, 'GET ' + path + '/result', {
      vars,
      parse: true,
      statuses: [409],
    });
    if (pending.status === 200)
      return integrityError(actor, 'premature-tryout-result', { attemptId });
    if (!pending.ok) return false;
    if (pending.payload?.code !== 'TRYOUT_RESULT_PENDING') {
      return integrityError(actor, 'unexpected-result-gate', { attemptId });
    }
  } else {
    const result = request(actor, 'GET ' + path + '/result', { vars, parse: true });
    if (!result.ok) return false;
    if (result.payload?.attemptId !== attemptId || result.payload?.score !== value.score) {
      return integrityError(actor, 'result-mismatch', { attemptId });
    }
  }
  return true;
}

function exerciseAssessment(actor) {
  const path = assessments[actor.role].path;
  if (finished) return (mixedLocal || read(actor, actor.role)) && read(actor, 'browse');
  if (!assessment) {
    const attempt = start(actor);
    if (!attempt) return false;
    assessment = { attempt, index: 0, nextHeartbeatAt: 0 };
  }
  const { attempt, index } = assessment;
  const vars = { attemptId: attempt.id };
  if (index === attempt.questions.length) {
    const ok = submit(actor, attempt.id);
    if (ok) {
      assessment = null;
      finished = actor.role !== 'drill';
    }
    return ok;
  }
  const question = attempt.questions[index];
  const response = answer(question);
  if (!response) return integrityError(actor, 'unsupported-question', { attemptId: attempt.id });
  const body = { answer: response };
  if (actor.role === 'pretest') body.expectedRevision = question.revision;
  const saved = request(actor, 'PATCH ' + path + '/answers/{questionInstanceId}', {
    vars: { ...vars, questionInstanceId: question.questionInstanceId },
    body,
    parse: true,
  });
  if (!saved.ok) return false;
  if (
    !sameAnswer(response, saved.payload?.answer ?? { optionId: saved.payload?.selectedOptionId })
  ) {
    return integrityError(actor, 'saved-answer-ack-mismatch', { attemptId: attempt.id });
  }
  receipt('save', actor, {
    kind: actor.role,
    attemptId: attempt.id,
    questionInstanceId: question.questionInstanceId,
    answer: response,
  });
  assessment.index++;
  if (index === Math.floor(attempt.questions.length / 2)) {
    const resumed = request(actor, 'GET ' + path, { vars, parse: true });
    const reloadedQuestion = resumed.payload?.questions?.find(
      (item) => item.questionInstanceId === question.questionInstanceId,
    );
    if (!resumed.ok) return false;
    if (
      !sameAnswer(
        response,
        reloadedQuestion?.answer ?? { optionId: reloadedQuestion?.selectedOptionId },
      )
    ) {
      return integrityError(actor, 'resumed-answer-mismatch', { attemptId: attempt.id });
    }
  }
  return true;
}

function think(actor) {
  const compactAnswerPacing = mixedLocal && assessment !== null && !finished;
  const seconds = compactAnswerPacing ? 1.2 + Math.random() * 1.6 : 8 + Math.random() * 12;
  const until = Date.now() + seconds * 1000;
  const sessionId = assessment?.attempt.clock?.sessionId;
  if (actor.role !== 'drill' || !sessionId) {
    sleep(Math.max(0, (until - Date.now()) / 1000));
    return true;
  }
  while (Date.now() < until) {
    const now = Date.now();
    if (now >= assessment.nextHeartbeatAt) {
      assessment.nextHeartbeatAt = now + 10000;
      const { ok, payload } = request(actor, drillClock, {
        vars: { attemptId: assessment.attempt.id },
        body: { action: 'heartbeat', sessionId },
        parse: true,
      });
      if (!ok || payload?.sessionId !== sessionId) return false;
    }
    sleep(Math.max(0, (Math.min(until, assessment.nextHeartbeatAt) - Date.now()) / 1000));
  }
  return true;
}

function countActor() {
  if (!claimed) {
    participants.add(1);
    claimed = true;
  }
}

export function mixed() {
  const index = exec.vu.idInTest - 1;
  const actor = regularActors[index];
  if (!actor) throw new Error('VU has no provisioned actor');
  if (!claimed && drillCapacity) {
    if (mixedLocal) sleep((index / regularActors.length) * 20);
    else
      sleep(
        plan.suite === 'drill-steady' ? (index / regularActors.length) * 60 : Math.random() * 8,
      );
  }
  countActor();
  integrity.add(0);
  const assessmentManagesNavigation = mixedLocal
    ? assessment !== null || finished
    : actor.role === 'drill' && assessment !== null;
  const ok =
    signIn(actor) &&
    (assessmentManagesNavigation || read(actor, actor.role)) &&
    (extrasDone || (extrasDone = runExtras(actor))) &&
    (!plan.assessmentWrites.includes(actor.role) || exerciseAssessment(actor));
  const clockOk = think(actor);
  journeys.add(ok && clockOk, { role: actor.role });
}

export function burst() {
  const index = exec.scenario.iterationInTest;
  const actor = targetActors[index];
  if (!actor) throw new Error('Spike iteration has no provisioned actor');
  spikes.add(1);
  participants.add(1);
  integrity.add(0);
  // Sessions are provisioned before the burst; no identity/auth request precedes the scheduled operation.
  let ok;
  if (plan.suite.endsWith('-start')) ok = !!start(actor);
  else {
    const attemptId = actor.vars.attemptId;
    ok = submit(actor, attemptId, index % 20 === 0);
  }
  journeys.add(ok, { role: actor.role });
}

export function handleSummary(result) {
  return { [__ENV.NUMORA_CAPACITY_SUMMARY]: JSON.stringify(result) };
}
