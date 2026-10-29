import { createServer, createConnection } from 'node:net';

// A run-owned TCP fault boundary. Never stops or reconfigures the upstream service.
export async function createFaultProxy(url) {
  const target = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !['postgres:', 'postgresql:', 'redis:'].includes(target.protocol)
  )
    throw new Error('FAULT_PROXY_REQUIRES_LOCAL_TEST_SERVICE');
  const upstreamHost = target.hostname;
  const upstreamPort = Number(
    target.port || (target.protocol.startsWith('postgres') ? 5432 : 6379),
  );
  const sockets = new Set();
  let blocked = false,
    rejectedConnections = 0;
  const server = createServer((incoming) => {
    sockets.add(incoming);
    incoming.on('error', () => {});
    if (blocked) {
      rejectedConnections++;
      incoming.once('close', () => sockets.delete(incoming));
      incoming.destroy();
      return;
    }
    const upstream = createConnection({ host: upstreamHost, port: upstreamPort });
    sockets.add(upstream);
    incoming.once('close', () => {
      sockets.delete(incoming);
      upstream.destroy();
    });
    upstream.once('close', () => {
      sockets.delete(upstream);
      incoming.destroy();
    });
    upstream.on('error', () => incoming.destroy());
    incoming.pipe(upstream);
    upstream.pipe(incoming);
  });
  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', ready);
  });
  const proxyUrl = new URL(target);
  proxyUrl.hostname = '127.0.0.1';
  proxyUrl.port = String(server.address().port);
  return {
    url: proxyUrl.href,
    rejectedConnections: () => rejectedConnections,
    block() {
      blocked = true;
      for (const socket of sockets) socket.destroy();
    },
    restore() {
      blocked = false;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((ready) => server.close(ready));
    },
  };
}
