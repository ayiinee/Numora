import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { createApiProxy } from './api-proxy';
import { workerLayout } from './api-role';

export async function startApiTopology(
  port: number,
  httpWorkers: number,
  onFatal: () => void,
  spawnWorker: (env: NodeJS.ProcessEnv) => Worker = (env) =>
    new Worker(resolve(__dirname, 'api-worker.js'), { env }),
) {
  const layout = workerLayout(port, httpWorkers, Number(process.env.DB_POOL_MAX ?? 10));
  const pvpPort = layout[layout.length - 1]!.port;
  const workers: Worker[] = [];
  const proxy = createApiProxy(
    layout.filter((item) => item.role === 'http').map((item) => item.port),
    pvpPort,
  );
  let closing = false;
  let closed: Promise<void> | undefined;
  const exited = new Set<Worker>();
  let pvpOwner: Worker | undefined;
  let pvpReady = false;
  const close = async () => {
    if (closed) return closed;
    closing = true;
    closed = (async () => {
      await proxy.close();
      await Promise.all(
        workers.map(
          (worker) =>
            new Promise<void>((done) => {
              if (exited.has(worker)) {
                done();
                return;
              }
              const timer = setTimeout(() => {
                void worker.terminate().then(() => done());
              }, 10_000);
              worker.once('exit', () => {
                clearTimeout(timer);
                done();
              });
              try {
                worker.postMessage('shutdown');
              } catch {
                clearTimeout(timer);
                void worker.terminate().finally(done);
              }
            }),
        ),
      );
    })();
    return closed;
  };
  const failed = () => {
    if (!closing) void close().finally(onFatal);
  };
  try {
    await Promise.all(
      layout.map(
        (item) =>
          new Promise<void>((ready, reject) => {
            const worker = spawnWorker({
              ...process.env,
              NUMORA_API_ROLE: item.role,
              API_PORT: String(item.port),
              DB_POOL_MAX: String(item.poolMax),
            });
            workers.push(worker);
            const timer = setTimeout(
              () => reject(new Error('API worker startup timed out.')),
              120_000,
            );
            worker.on('message', (message: unknown) => {
              if (
                message &&
                typeof message === 'object' &&
                'ready' in message &&
                message.ready === true
              ) {
                clearTimeout(timer);
                if (item.role === 'pvp') {
                  pvpOwner = worker;
                  pvpReady = true;
                }
                ready();
              }
              if (
                item.role === 'http' &&
                message &&
                typeof message === 'object' &&
                'type' in message &&
                message.type === 'pvp-readiness-query' &&
                'requestId' in message &&
                typeof message.requestId === 'string' &&
                message.requestId.length <= 64
              ) {
                try {
                  worker.postMessage({
                    type: 'pvp-readiness-result',
                    requestId: message.requestId,
                    ready: !closing && pvpReady && !!pvpOwner && !exited.has(pvpOwner),
                  });
                } catch {
                  /* Worker is closing. */
                }
              }
            });
            worker.once('error', () => {
              clearTimeout(timer);
              reject(new Error('API worker startup failed.'));
              failed();
            });
            worker.once('exit', () => {
              exited.add(worker);
              if (worker === pvpOwner) pvpReady = false;
              clearTimeout(timer);
              reject(new Error('API worker exited.'));
              failed();
            });
          }),
      ),
    );
    if (closing) throw new Error('API worker stopped during startup.');
    await new Promise<void>((ready, reject) => {
      proxy.server.once('error', reject);
      proxy.server.listen(port, process.env.API_BIND_HOST, ready);
    });
    return { close, layout };
  } catch (error) {
    await close();
    throw error;
  }
}
