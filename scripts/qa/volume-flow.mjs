// Cumulative stages share one queue. A failed stage must never receive more load.
export async function runVolumeStages(sizes, execute) {
  if (
    !Array.isArray(sizes) ||
    sizes.length === 0 ||
    sizes.some((n, i) => !Number.isSafeInteger(n) || n < 1 || (i > 0 && n <= sizes[i - 1]))
  )
    throw new Error('INVALID_VOLUME_STAGES');
  const checks = [];
  let stopped;
  for (const count of sizes) {
    const name = `volume-${count}-event-identity-and-payload`;
    if (stopped) {
      checks.push({
        name,
        count,
        status: 'NOT_RUN',
        reason: `PREVIOUS_STAGE_${stopped.status}: ${stopped.name}`,
      });
      continue;
    }
    const outcome = await execute({ count, name });
    if (!outcome || !['PASS', 'FAIL', 'BLOCKED'].includes(outcome.status))
      throw new Error('INVALID_VOLUME_STAGE_OUTCOME');
    const check = { name, count, status: outcome.status };
    if (outcome.reason) check.reason = outcome.reason;
    checks.push(check);
    if (check.status !== 'PASS') stopped = check;
  }
  return checks;
}

export function summarizeChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) throw new Error('EMPTY_CHECKS');
  const result = { passed: 0, failed: 0, blocked: 0, skipped: 0, total: checks.length };
  const field = { PASS: 'passed', FAIL: 'failed', BLOCKED: 'blocked', NOT_RUN: 'skipped' };
  for (const check of checks) {
    if (!Object.hasOwn(field, check.status)) throw new Error('UNKNOWN_CHECK_STATUS');
    result[field[check.status]]++;
  }
  return result;
}

// EXISTS controls the loop; full counts/age remain required periodic/final evidence.
// The deadline is cooperative: an in-flight SQL query/batch is not forcibly cancelled.
export async function drainVolumeQueue({
  budgetMs,
  pending,
  drainBatch,
  snapshot,
  onSnapshot = () => {},
  sampleIntervalMs = 1000,
  clock = () => performance.now(),
}) {
  if (
    !Number.isFinite(budgetMs) ||
    budgetMs <= 0 ||
    !Number.isFinite(sampleIntervalMs) ||
    sampleIntervalMs <= 0
  )
    throw new Error('INVALID_VOLUME_DRAIN_BOUND');
  const start = clock();
  let lastSample = start;
  let batches = 0;
  async function record(final) {
    const state = await snapshot();
    if (
      !state ||
      !Number.isSafeInteger(state.total) ||
      !Number.isSafeInteger(state.pending) ||
      state.pending < 0 ||
      state.total < state.pending ||
      !Number.isFinite(state.oldest_seconds) ||
      state.oldest_seconds < 0
    )
      throw new Error('INVALID_VOLUME_SNAPSHOT');
    await onSnapshot({ ...state, elapsedMs: clock() - start, batches, final });
    return state;
  }
  await record(false);
  while (clock() - start < budgetMs) {
    const hasPending = await pending();
    if (typeof hasPending !== 'boolean') throw new Error('INVALID_VOLUME_PENDING_PROBE');
    if (!hasPending || clock() - start >= budgetMs) break;
    await drainBatch(10);
    batches++;
    if (clock() - lastSample >= sampleIntervalMs) {
      await record(false);
      lastSample = clock();
    }
  }
  const remaining = await record(true);
  const elapsedMs = clock() - start;
  if (remaining.pending > 0 || elapsedMs > budgetMs)
    throw Object.assign(
      new Error(
        'Volume drain budget exhausted or backlog remains; capacity conclusion remains incomplete',
      ),
      { code: 'EXPERIMENT_INCOMPLETE', remaining, elapsedMs },
    );
  return { ...remaining, batches, elapsedMs: clock() - start };
}
