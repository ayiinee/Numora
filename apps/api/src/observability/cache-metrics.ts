type Kind = 'curriculum' | 'pvp';
const totals = new Map<string, number>();
export function cacheMetrics(kind: Kind) {
  const counters = { hits: 0, misses: 0, coalesced: 0, refreshes: 0, redisErrors: 0 };
  return new Proxy(counters, {
    set(target, property: keyof typeof counters, value: number) {
      const delta = value - target[property];
      if (Number.isFinite(delta) && delta > 0) {
        const key = `${kind}:${property}`;
        totals.set(key, (totals.get(key) ?? 0) + delta);
      }
      target[property] = value;
      return true;
    },
  });
}
export function cacheMetricsText() {
  return [...totals]
    .map(([key, value]) => {
      const [cache, result] = key.split(':');
      return `numora_cache_events_total{cache="${cache}",result="${result}"} ${value}`;
    })
    .join('\n');
}
