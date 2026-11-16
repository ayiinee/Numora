import { randomUUID } from 'node:crypto';
import { parentPort, type MessagePort } from 'node:worker_threads';

type ReadinessPort = Pick<MessagePort, 'on' | 'postMessage'>;

/** Transport liveness only. No user, authorization or domain data is cached here. */
export class PvpOwnerReadiness {
  private readonly pending = new Map<string, (ready: boolean) => void>();
  constructor(private readonly port: ReadinessPort | null) {
    port?.on('message', (message: unknown) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        message.type !== 'pvp-readiness-result' ||
        !('requestId' in message) ||
        typeof message.requestId !== 'string'
      )
        return;
      this.pending.get(message.requestId)?.('ready' in message && message.ready === true);
    });
    port?.on('close', () => {
      for (const done of this.pending.values()) done(false);
    });
  }
  ready(): Promise<boolean> {
    const port = this.port;
    if (!port) return Promise.resolve(false);
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(false), 250);
      const done = (ready: boolean) => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve(ready);
      };
      this.pending.set(requestId, done);
      try {
        port.postMessage({ type: 'pvp-readiness-query', requestId });
      } catch {
        done(false);
      }
    });
  }
}

let client: PvpOwnerReadiness | undefined;
export function pvpOwnerReady() {
  client ??= new PvpOwnerReadiness(parentPort);
  return client.ready();
}
