import { createHash, randomUUID } from 'node:crypto';

type Metric = { count: number; sum: number; max: number; buckets: number[] };
const limits = [0.005, 0.025, 0.1, 0.5, 2, 10];
const metrics = new Map<string, Metric>();
const gauges = new Map<string, number>();
export const runtimeInstanceId = randomUUID();
let service: 'api' | 'worker' = 'api';
export const metricsEnabled = () => process.env.NUMORA_OBSERVABILITY_ENABLED === 'true';
export function setRuntimeService(value: 'api' | 'worker') {
  service = value;
}
export function runtimeService() {
  return service;
}
export function runtimeNamespace() {
  const url = new URL(process.env.DATABASE_URL ?? 'postgres://unconfigured/local');
  // API/worker may use different runtime roles or direct/pooler routes to the same project.
  const direct = /^db\.([^.]+)\.supabase\.co$/.exec(url.hostname)?.[1];
  const pooler = url.hostname.endsWith('.pooler.supabase.com')
    ? decodeURIComponent(url.username).split('.').at(-1)
    : undefined;
  const project = direct ?? pooler ?? `${url.hostname}:${url.port}/${url.pathname}`;
  return createHash('sha256')
    .update(`${project}/${process.env.BULLMQ_PREFIX ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}
export function observeRuntime(name: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  if (
    !metricsEnabled() ||
    !/^numora_[a-z_]+$/.test(name) ||
    (metrics.size >= 64 && !metrics.has(name))
  )
    return;
  const value = metrics.get(name) ?? { count: 0, sum: 0, max: 0, buckets: limits.map(() => 0) };
  value.count++;
  value.sum += seconds;
  value.max = Math.max(value.max, seconds);
  limits.forEach((limit, index) => {
    if (seconds <= limit) value.buckets[index]!++;
  });
  metrics.set(name, value);
}
export function gaugeRuntime(name: string, value: number) {
  if (!Number.isFinite(value)) return;
  if (metricsEnabled() && /^numora_[a-z_]+$/.test(name) && (gauges.size < 64 || gauges.has(name)))
    gauges.set(name, value);
}
export async function measureRuntime<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } catch (error) {
    observeRuntime(`${name}_errors`, 1);
    throw error;
  } finally {
    observeRuntime(`${name}_seconds`, (performance.now() - started) / 1000);
  }
}
export function runtimeMetricsText() {
  const labels = `service="${service}",instance="${runtimeInstanceId}"`;
  const lines: string[] = [];
  for (const [name, value] of metrics) {
    lines.push(
      `${name}_count{${labels}} ${value.count}`,
      `${name}_sum{${labels}} ${value.sum}`,
      `${name}_max{${labels}} ${value.max}`,
    );
    limits.forEach((limit, index) =>
      lines.push(`${name}_bucket{${labels},le="${limit}"} ${value.buckets[index]}`),
    );
    lines.push(`${name}_bucket{${labels},le="+Inf"} ${value.count}`);
  }
  for (const [name, value] of gauges) lines.push(`${name}{${labels}} ${value}`);
  return lines.join('\n');
}

/** Only public postgres-js APIs; lazy queries remain lazy and transaction SQL is wrapped too. */
export function instrumentSql<T extends object>(client: T): T {
  if (!metricsEnabled()) return client;
  let inFlight = 0;
  const query = (raw: object): object => {
    if (!('then' in raw) || typeof raw.then !== 'function') return raw;
    let observed: Promise<unknown> | undefined;
    const start = () => {
      if (observed) return observed;
      const started = performance.now();
      inFlight++;
      gaugeRuntime('numora_db_in_flight', inFlight);
      observed = Promise.resolve(raw)
        .then(
          (result: unknown) => {
            if (Array.isArray(result)) observeRuntime('numora_db_result_rows', result.length);
            // Sample logical JSON size, not wire/TLS bytes. Never retain or log row values.
            if (Math.random() < 0.01)
              try {
                let visited = 0;
                let characters = 0;
                const value = JSON.stringify(result, (_key, item: unknown) => {
                  // Bound sampling work. Oversized samples are skipped rather than reported as full bytes.
                  characters += _key.length + (typeof item === 'string' ? item.length : 16);
                  if (
                    ++visited > 10000 ||
                    characters > 262144 ||
                    (typeof item === 'string' && item.length > 65536)
                  )
                    throw new Error('sample budget');
                  return item;
                });
                observeRuntime('numora_db_sampled_json_bytes', Buffer.byteLength(value ?? ''));
              } catch {
                observeRuntime('numora_db_json_samples_skipped', 1);
              }
            return result;
          },
          (error: unknown) => {
            observeRuntime('numora_db_errors', 1);
            throw error;
          },
        )
        .finally(() => {
          inFlight--;
          gaugeRuntime('numora_db_in_flight', inFlight);
          observeRuntime('numora_db_query_seconds', (performance.now() - started) / 1000);
        });
      return observed;
    };
    const proxy = new Proxy(raw, {
      get(target, key) {
        if (key === 'then' || key === 'catch' || key === 'finally')
          return (...args: unknown[]) => {
            const promise = start();
            return Reflect.apply(
              Reflect.get(promise, key) as (...args: unknown[]) => unknown,
              promise,
              args,
            );
          };
        const value = Reflect.get(target, key, target) as unknown;
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          // execute/forEach start eagerly by contract; observe from that same point.
          if (key === 'execute' || key === 'forEach') start();
          const result = Reflect.apply(value, target, args) as unknown;
          return result === target ? proxy : result;
        };
      },
    });
    return proxy;
  };
  const wrap = (raw: object): object =>
    new Proxy(raw, {
      apply(target, receiver, args: unknown[]) {
        return query(Reflect.apply(target as (...args: unknown[]) => object, receiver, args));
      },
      get(target, key) {
        const value = Reflect.get(target, key, target) as unknown;
        if (typeof value !== 'function') return value;
        if (key === 'unsafe' || key === 'file')
          return (...args: unknown[]) => query(Reflect.apply(value, target, args) as object);
        if (key === 'begin' || key === 'savepoint')
          return async (...args: unknown[]) => {
            const started = performance.now();
            const callbackAt = args.findIndex((arg) => typeof arg === 'function');
            if (callbackAt < 0) return Reflect.apply(value, target, args) as unknown;
            const callback = args[callbackAt] as (tx: object) => unknown;
            args[callbackAt] = (tx: object) => {
              observeRuntime(
                'numora_db_transaction_start_seconds',
                (performance.now() - started) / 1000,
              );
              return callback(wrap(tx));
            };
            try {
              return (await Reflect.apply(value, target, args)) as unknown;
            } finally {
              observeRuntime('numora_db_transaction_seconds', (performance.now() - started) / 1000);
            }
          };
        if (key === 'reserve')
          return async (...args: unknown[]) => {
            const started = performance.now();
            try {
              return wrap((await Reflect.apply(value, target, args)) as object);
            } finally {
              observeRuntime('numora_db_acquire_seconds', (performance.now() - started) / 1000);
            }
          };
        return value.bind(target) as unknown;
      },
    });
  return wrap(client) as T;
}
