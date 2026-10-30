import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import exec from 'k6/execution';
const completed = new Counter('qa_completed');
const integrityErrors = new Counter('qa_integrity_errors');
const clientEvents = new Counter('qa_client_event');
const vus = JSON.parse(__ENV.QA_VUS || '[10,25,50,100]');
const seconds = Number(__ENV.QA_STAGE_SECONDS || 60);
export const options = {
  scenarios: Object.fromEntries(
    vus.map((count, index) => [
      'vus_' + count,
      {
        executor: 'constant-vus',
        vus: count,
        duration: seconds + 's',
        startTime: index * (seconds + 10) + 's',
        gracefulStop: '10s',
      },
    ]),
  ),
  thresholds: {
    qa_integrity_errors: ['count==0'],
    http_req_failed: [{ threshold: 'rate<0.2', abortOnFail: true, delayAbortEval: '60s' }],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};
const api = 'http://localhost:3501/api/v1';
export function setup() {
  const actors = [];
  for (let i = 0; i < Math.max(...vus); i++) {
    const response = http.post('http://localhost:3502/actors', '');
    if (response.status !== 201) throw new Error('QA_ACTOR_SETUP_FAILED');
    actors.push(response.json());
  }
  return actors;
}
export default function (actors) {
  integrityErrors.add(0);
  const actor = actors[(__VU - 1) % actors.length];
  const operationId = `${exec.scenario.name}:${__VU}:${__ITER}`;
  const receipt = (kind, fields = {}) =>
    clientEvents.add(1, {
      phase: __ENV.QA_LOAD_PHASE || 'load',
      op_id: operationId,
      actor_id: actor.profileId,
      kind,
      ...fields,
    });
  const params = {
    headers: {
      Authorization: 'Bearer ' + actor.session.access_token,
      'Content-Type': 'application/json',
      'x-qa-operation-id': operationId,
    },
    timeout: '15s',
  };
  receipt('start_requested');
  const started = http.post(
    api + '/assessments/drill/attempts',
    JSON.stringify({ levelId: '00000000-0000-4000-8000-000000000102' }),
    params,
  );
  if (!check(started, { 'start accepted': (r) => r.status === 201 })) {
    receipt('start_response', {
      http_status: String(started.status),
      error_code: String(started.error_code || ''),
    });
    sleep(1);
    return;
  }
  const attempt = started.json();
  receipt('start_response', {
    http_status: String(started.status),
    attempt_id: attempt.id,
    attempt_status: ['inProgress', 'completed'].includes(attempt.status)
      ? attempt.status
      : 'unknown',
    question_count: String(Array.isArray(attempt.questions) ? attempt.questions.length : -1),
  });
  if (!Array.isArray(attempt.questions) || attempt.questions.length !== 10) {
    integrityErrors.add(1);
    return;
  }
  for (let i = 0; i < 10; i++) {
    const saved = http.patch(
      api +
        '/assessment-attempts/' +
        attempt.id +
        '/answers/' +
        attempt.questions[i].questionInstanceId,
      JSON.stringify({ optionId: i < 8 ? 'B' : 'A' }),
      params,
    );
    if (!check(saved, { 'answer acknowledged': (r) => r.status === 200 })) {
      receipt('answer_failed', {
        attempt_id: attempt.id,
        http_status: String(saved.status),
        error_code: String(saved.error_code || ''),
      });
      return;
    }
  }
  receipt('submit_requested', { attempt_id: attempt.id });
  const submitted = http.post(api + '/assessment-attempts/' + attempt.id + '/submit', null, params);
  if (check(submitted, { 'submit accepted': (r) => r.status === 201 })) {
    const result = submitted.json();
    const correct =
      result.attemptId === attempt.id &&
      result.score === 80 &&
      result.reward &&
      result.reward.baseXp === 80 &&
      Number.isInteger(result.reward.totalXp) &&
      result.reward.totalXp >= 80 &&
      result.reward.totalXp <= 130;
    receipt('submit_response', {
      attempt_id: attempt.id,
      http_status: String(submitted.status),
      valid: correct ? '1' : '0',
      score: String(result.score),
      xp: String(result.reward?.totalXp),
    });
    if (!correct) integrityErrors.add(1);
    else completed.add(1);
  } else
    receipt('submit_response', {
      attempt_id: attempt.id,
      http_status: String(submitted.status),
      error_code: String(submitted.error_code || ''),
    });
  receipt('iteration_finished', { attempt_id: attempt.id });
  sleep(1);
}
export function handleSummary(data) {
  return { [__ENV.QA_EVIDENCE_FILE]: JSON.stringify(data, null, 2) };
}
