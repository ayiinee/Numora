export function apiRole() {
  const role = process.env.NUMORA_API_ROLE ?? 'all';
  if (role !== 'all' && role !== 'http' && role !== 'pvp')
    throw new Error('Invalid NUMORA_API_ROLE.');
  return role;
}

export function pvpInternalOrigin() {
  const url = new URL(process.env.NUMORA_PVP_INTERNAL_ORIGIN ?? '');
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('PvP internal origin must be a bare loopback HTTP origin.');
  return url.origin;
}

export function workerLayout(port: number, count: number, pool: number) {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 8 ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port + count + 2 > 65535 ||
    !Number.isSafeInteger(pool) ||
    pool < count + 1
  )
    throw new Error('Invalid API worker count, port or total DB pool budget.');
  return Array.from({ length: count + 1 }, (_, index) => ({
    role: index === count ? ('pvp' as const) : ('http' as const),
    port: port + 2 + index,
    poolMax: Math.floor(pool / (count + 1)) + (index < pool % (count + 1) ? 1 : 0),
  }));
}
