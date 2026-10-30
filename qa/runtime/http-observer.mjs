// Test-harness observation only. Never imported by application entrypoints.
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { relative, resolve, sep, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function safeErrorFingerprint(error) {
  const seen = new Set();
  const codes = new Set();
  const operations = new Set();
  for (let e = error; e && typeof e === 'object' && !seen.has(e) && seen.size < 8; e = e.cause) {
    seen.add(e);
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) codes.add(e.code);
    if (typeof e.query === 'string') {
      if (/record_assessment_delivery/.test(e.query)) operations.add('assessment_delivery');
      else if (/\bassessment_attempts\b/.test(e.query)) operations.add('assessment_attempts');
      else operations.add('other_database_operation');
    }
  }
  // Never retain messages, SQL, parameters, headers, tokens or stacks.
  return { sqlStates: [...codes], databaseOperations: [...operations] };
}

export function responseMetadata(body) {
  if (!body || typeof body !== 'object') return {};
  return {
    ...(uuid.test(body.attemptId || '') ? { attemptId: body.attemptId } : {}),
    ...(uuid.test(body.id || '') ? { responseId: body.id } : {}),
    ...(['inProgress', 'completed'].includes(body.status) ? { attemptStatus: body.status } : {}),
    ...(Array.isArray(body.questions) ? { questionCount: body.questions.length } : {}),
    ...(typeof body.score === 'number' && Number.isFinite(body.score) ? { score: body.score } : {}),
    ...(typeof body.reward?.totalXp === 'number' && Number.isFinite(body.reward.totalXp)
      ? { totalXp: body.reward.totalXp }
      : {}),
  };
}

export function createHttpObserver(root, file) {
  const local = relative(resolve(root, 'qa/.local'), resolve(file));
  if (
    !local ||
    isAbsolute(local) ||
    local.startsWith('..') ||
    local.startsWith(sep) ||
    /[\r\n\0]/.test(file)
  )
    throw Error('HTTP_OBSERVER_LOCAL_ARTIFACT_REQUIRED');
  const output = createWriteStream(file, { flags: 'wx', mode: 0o600 });
  let outputError;
  output.on('error', (e) => {
    outputError = e;
  });
  const contexts = new WeakMap();
  const emit = (req, event, data = {}) => {
    const c = contexts.get(req);
    if (!c || outputError) return;
    output.write(
      JSON.stringify({
        at: new Date().toISOString(),
        requestId: c.id,
        operationId: c.operationId,
        kind: c.kind,
        attemptId: c.attemptId,
        event,
        elapsedMs: performance.now() - c.started,
        ...data,
      }) + '\n',
    );
  };
  return {
    middleware(req, res, next) {
      const path = (req.url || '').split('?')[0];
      const submit = path.match(
        /^\/api\/v1\/assessment-attempts\/([a-f0-9-]{36})\/(submit|result)$/i,
      );
      const kind =
        req.method === 'POST' && path === '/api/v1/assessments/drill/attempts'
          ? 'start'
          : submit
            ? submit[2].toLowerCase()
            : null;
      if (!kind) return next();
      const op = req.headers['x-qa-operation-id'];
      contexts.set(req, {
        id: randomUUID(),
        operationId: typeof op === 'string' && /^[a-zA-Z0-9_:.-]{1,160}$/.test(op) ? op : null,
        kind,
        attemptId: submit && uuid.test(submit[1]) ? submit[1] : null,
        started: performance.now(),
      });
      emit(req, 'request_received');
      const json = res.json;
      res.json = function (body) {
        emit(req, 'response_prepared', { httpStatus: res.statusCode, ...responseMetadata(body) });
        return json.call(this, body);
      };
      req.once('aborted', () => emit(req, 'request_aborted'));
      res.once('finish', () => emit(req, 'response_finished', { httpStatus: res.statusCode }));
      res.once('close', () =>
        emit(req, 'response_closed', {
          httpStatus: res.statusCode,
          writableFinished: res.writableFinished,
        }),
      );
      next();
    },
    error(req, error) {
      emit(req, 'handler_error', safeErrorFingerprint(error));
    },
    close() {
      return new Promise((done, reject) => {
        if (outputError) return reject(outputError);
        output.end(() => (outputError ? reject(outputError) : done()));
      });
    },
  };
}
