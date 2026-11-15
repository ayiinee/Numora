import { createHash } from 'node:crypto';

export class FailoverError extends Error {}

// Ignore credential changes/aliases: they do not create new quota on one endpoint.
export function redisEndpointId(value) {
  const url = new URL(value);
  return createHash('sha256').update(`${url.hostname.toLowerCase()}:${url.port || '6379'}`).digest('hex');
}

export function validateFailoverState(state) {
  if (state?.version !== 1 || !Array.isArray(state.exhausted) ||
      state.exhausted.some((id) => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) ||
      !Number.isSafeInteger(state.cooldownUntil) || state.cooldownUntil < 0) {
    throw new FailoverError('State failover tidak valid; periksa redis-failover-state.json sebelum melanjutkan.');
  }
  return { version: 1, exhausted: [...new Set(state.exhausted)], cooldownUntil: state.cooldownUntil };
}

export async function autoFailover({ currentUrl, loadCandidates, probe, switchTo,
  readState, saveState, now = Date.now, log = console.log }) {
  const state = validateFailoverState(readState());
  try {
    // A real GET detects quota errors; PING may still succeed on an exhausted provider.
    await probe(currentUrl, { readOnly: true });
    log('[redis-failover] Redis aktif menerima command; koneksi dipertahankan.');
    return 'healthy';
  } catch (error) {
    if (error?.quotaExceeded !== true) {
      throw new FailoverError('Probe Redis aktif gagal tanpa konfirmasi limit; tidak melakukan perpindahan.');
    }
  }
  const timestamp = now();
  if (state.cooldownUntil > timestamp) {
    log('[redis-failover] Limit terdeteksi; menunggu cooldown sebelum mencoba lagi.');
    return 'cooldown';
  }
  const exhausted = new Set([...state.exhausted, redisEndpointId(currentUrl)]);
  const persist = () => saveState({
    version: 1, exhausted: [...exhausted], cooldownUntil: timestamp + 5 * 60_000,
  });
  // Persist before probing/restarting so a failure cannot cause a restart loop each minute.
  persist();
  const candidates = loadCandidates().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const currentIndex = candidates.findLastIndex((candidate) => redisEndpointId(candidate.url) === redisEndpointId(currentUrl));
  for (const candidate of candidates.slice(currentIndex + 1)) {
    const endpoint = redisEndpointId(candidate.url);
    if (exhausted.has(endpoint)) continue;
    try {
      await probe(candidate.url, { readOnly: false });
    } catch (error) {
      if (error?.quotaExceeded === true) { exhausted.add(endpoint); persist(); }
      log(`[redis-failover] ${candidate.name} belum siap; memeriksa cadangan berikutnya.`);
      continue;
    }
    log(`[redis-failover] Limit terkonfirmasi; beralih ke ${candidate.name}.`);
    // One restart attempt per cycle. Startup/DB errors must not cycle through all Redis instances.
    await switchTo(candidate.name);
    log(`[redis-failover] Peralihan ke ${candidate.name} selesai.`);
    return candidate.name;
  }
  throw new FailoverError('Tidak ada Redis cadangan berikutnya yang siap. Koneksi tidak diubah; periksa profil dan kuota cadangan.');
}
