import { Agent, createServer, request } from 'node:http';
import type { Socket } from 'node:net';

export function createApiProxy(httpPorts: readonly number[], pvpPort: number) {
  if (!httpPorts.length) throw new Error('HTTP workers are required.');
  const agent = new Agent({ keepAlive: true });
  const sockets = new Set<Socket>();
  let next = 0;
  const server = createServer((incoming, outgoing) => {
    const path = (incoming.url ?? '/').split('?')[0]!;
    const pvp =
      path === '/socket.io' ||
      path.startsWith('/socket.io/') ||
      path === '/api/v1/pvp' ||
      path.startsWith('/api/v1/pvp/') ||
      path.startsWith('/api/docs');
    const port = pvp ? pvpPort : httpPorts[next++ % httpPorts.length]!;
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, connection: 'keep-alive' },
        agent,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.on('error', () => outgoing.destroy());
        response.pipe(outgoing);
      },
    );
    upstream.on('error', () => {
      if (outgoing.headersSent) return outgoing.destroy();
      outgoing.writeHead(503, { 'Content-Type': 'application/problem+json' });
      outgoing.end(
        JSON.stringify({ type: 'about:blank', title: 'Service unavailable', status: 503 }),
      );
    });
    incoming.on('aborted', () => upstream.destroy());
    outgoing.on('close', () => {
      if (!outgoing.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (incoming, client, head) => {
    const upstream = request({
      hostname: '127.0.0.1',
      port: pvpPort,
      method: incoming.method,
      path: incoming.url,
      headers: incoming.headers,
      agent: false,
    });
    upstream.on('upgrade', (response, remote, remoteHead) => {
      client.write(
        `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
          response.rawHeaders.reduce(
            (all, value, index, headers) =>
              index % 2 === 0 ? all + `${value}: ${headers[index + 1]}\r\n` : all,
            '',
          ) +
          '\r\n',
      );
      if (head.length) remote.write(head);
      if (remoteHead.length) client.write(remoteHead);
      remote.on('error', () => client.destroy());
      client.on('error', () => remote.destroy());
      client.on('close', () => remote.destroy());
      remote.on('close', () => client.destroy());
      client.pipe(remote).pipe(client);
    });
    upstream.on('response', () => client.destroy());
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());
    upstream.end();
  });
  return {
    server,
    async close() {
      agent.destroy();
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
