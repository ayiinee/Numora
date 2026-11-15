import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const requireWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const percentile = (samples, percent) => {
  const sorted = samples.slice().sort((left, right) => left - right);
  return sorted.length ? sorted[Math.ceil(sorted.length * percent) - 1] : null;
};

function requireState(condition, message) {
  if (!condition) throw new Error(message);
}

function client(io, origin, web, actor, signal, connected) {
  const socket = io(origin + '/pvp', {
    transports: ['websocket'],
    followRedirects: false,
    reconnection: false,
    autoConnect: false,
    auth: { authorization: 'Bearer ' + actor.token },
    extraHeaders: { Origin: web },
    timeout: 8000,
  });
  let state;
  socket.on('connect', () => connected(1));
  socket.on('disconnect', () => connected(-1));
  const abort = () => socket.disconnect();
  signal.addEventListener('abort', abort, { once: true });
  const update = (envelope) => {
    if (envelope?.payload?.matchId) state = envelope.payload;
  };
  socket.on('room:state', update);

  async function connect() {
    requireState(!signal.aborted, 'stopped');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => done(reject, new Error('connect-timeout')), 9000);
      const onConnect = () => done(resolve);
      const onFailure = () => done(reject, new Error('connect-error'));
      function done(finish, error) {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
        socket.off('connect_error', onFailure);
        finish(error);
      }
      socket.once('connect', onConnect);
      socket.once('connect_error', onFailure);
      socket.connect();
    });
  }

  async function command(event, payload, durations) {
    requireState(!signal.aborted && socket.connected, 'socket-unavailable');
    const requestId = randomUUID();
    const started = performance.now();
    let answer;
    try {
      answer = await socket.timeout(8000).emitWithAck(event, {
        event,
        eventVersion: '1',
        requestId,
        sentAt: new Date().toISOString(),
        payload,
      });
    } catch {
      throw new Error('missing-ack-' + event);
    }
    if (event === 'answer:submit') durations.push(performance.now() - started);
    const code = answer?.payload?.error?.code;
    const reason = /^[A-Z][A-Z0-9_]{0,63}$/.test(code ?? '') ? ':' + code : '';
    requireState(
      answer?.requestId === requestId && answer?.payload?.ok === true,
      'rejected-' + event + reason,
    );
    return answer.payload.state;
  }

  async function until(predicate) {
    const started = performance.now();
    while (!signal.aborted && performance.now() - started < 28000) {
      if (state && predicate(state)) return state;
      await delay(100, undefined, { signal });
    }
    throw new Error('state-timeout');
  }

  return {
    connect,
    command,
    until,
    disconnect: abort,
    close: () => {
      signal.removeEventListener('abort', abort);
      socket.disconnect();
    },
  };
}

async function play(host, guest, difficulty, reconnect, durations, signal) {
  const initial = await host.command('room:create', { difficulty });
  const { matchId, roomCode } = initial;
  await guest.command('room:join', { roomCode });
  await Promise.all([
    host.command('player:ready', { matchId }),
    guest.command('player:ready', { matchId }),
  ]);
  await host.command('match:start', { matchId });
  const questions = new Set();
  for (let round = 1; round <= 10; round++) {
    const nextQuestion = (state) =>
      state.matchId === matchId &&
      state.status === 'RUNNING' &&
      state.question &&
      !questions.has(state.question.id);
    let [first, second] = await Promise.all([host.until(nextQuestion), guest.until(nextQuestion)]);
    if (round === 1 && reconnect) {
      guest.disconnect();
      if (reconnect === 'late') {
        const ended = await host.until((state) => state.status === 'FINISHED');
        requireState(
          ended.endReason === 'FORFEIT' && !ended.recordEligible,
          'late-reconnect-forfeit',
        );
        await delay(1200, undefined, { signal });
        await guest.connect();
        return 'forfeit';
      }
      await delay(2000, undefined, { signal });
      await guest.connect();
      second = await guest.command('match:reconnect', { matchId });
      first = await host.until(nextQuestion);
    }
    const question = first.question;
    requireState(
      question.id === second.question?.id &&
        question.order === second.question.order &&
        question.deadlineAt === second.question.deadlineAt &&
        question.options?.[0]?.id &&
        !('answerKey' in question) &&
        !('explanation' in question),
      'question-divergence',
    );
    questions.add(question.id);
    await delay(1600, undefined, { signal });
    await Promise.all(
      [host, guest].map((client) =>
        client.command(
          'answer:submit',
          {
            matchId,
            questionId: question.id,
            optionId: question.options[0].id,
          },
          durations,
        ),
      ),
    );
  }
  const results = await Promise.all(
    [host, guest].map((player) =>
      player.until((state) => state.status === 'FINISHED' && state.matchId === matchId),
    ),
  );
  requireState(
    results.every(
      (state) =>
        state.endReason === 'COMPLETED' &&
        state.recordEligible &&
        state.players.length === 2 &&
        state.players.every((entry) => Number.isFinite(entry.points)),
    ),
    'result-invalid',
  );
  const scores = (state) =>
    state.players
      .map((entry) => entry.studentId + ':' + entry.points)
      .sort()
      .join('|');
  requireState(scores(results[0]) === scores(results[1]), 'result-divergence');
  return 'completed';
}

export async function runPvp(plan, phase, actors, stopSignal, onFailure) {
  const { io } = requireWeb('socket.io-client');
  const durations = [];
  const controller = new AbortController();
  const onStop = () => controller.abort();
  stopSignal.addEventListener('abort', onStop, { once: true });
  if (stopSignal.aborted) onStop();
  const signal = controller.signal;
  setMaxListeners(0, signal);
  let connected = 0;
  let maxConnected = 0;
  let pairsVerified = 0;
  const failures = {};
  const counts = { completed: 0, forfeit: 0 };
  const update = (delta) => {
    connected += delta;
    maxConnected = Math.max(maxConnected, connected);
  };
  const clients = actors.map((actor) => client(io, plan.api, plan.web, actor, signal, update));
  const failure = (error) => {
    if (signal.aborted) return;
    const reason = error.message;
    failures[reason] = (failures[reason] ?? 0) + 1;
    if (/divergence|result-invalid|late-reconnect-forfeit/.test(reason))
      onFailure('PvP integrity failure');
  };
  const timer = setTimeout(() => controller.abort(), phase.seconds * 1000);
  try {
    const open = await Promise.allSettled(clients.map((entry) => entry.connect()));
    const difficulties = ['easy', 'medium', 'hard'];
    await Promise.allSettled(
      clients
        .filter((_, index) => index % 2 === 0)
        .map(async (host, index) => {
          const guest = clients[index * 2 + 1];
          try {
            if (
              open[index * 2].status !== 'fulfilled' ||
              open[index * 2 + 1].status !== 'fulfilled'
            ) {
              throw new Error('pair-could-not-connect');
            }
            await delay(200 * (index % 15), undefined, { signal });
            let firstMatch = true;
            while (!signal.aborted) {
              // Twenty percent of first matches lose one socket, approximately ten percent of all clients.
              const reconnect =
                firstMatch && index % 10 === 0 && clients.length > 2
                  ? 'late'
                  : firstMatch && (index % 10 === 1 || clients.length === 2)
                    ? 'early'
                    : null;
              counts[
                await play(host, guest, difficulties[index % 3], reconnect, durations, signal)
              ]++;
              if (firstMatch) pairsVerified++;
              firstMatch = false;
              await delay(4000, undefined, { signal });
            }
          } catch (error) {
            failure(error);
          }
        }),
    );
  } finally {
    clearTimeout(timer);
    stopSignal.removeEventListener('abort', onStop);
    clients.forEach((entry) => entry.close());
  }
  const expected = clients.length / 2;
  const errors = Object.values(failures).reduce((sum, count) => sum + count, 0);
  const p95 = percentile(durations, 0.95);
  return {
    ...counts,
    pairsVerified,
    maxConnected,
    expectedConnections: clients.length,
    acknowledgments: durations.length,
    p95,
    p99: percentile(durations, 0.99),
    failures,
    pass:
      maxConnected === clients.length &&
      pairsVerified === expected &&
      errors / (errors + counts.completed + counts.forfeit) < 0.01 &&
      p95 !== null &&
      p95 <= plan.budgets.pvp,
  };
}
