import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { Server as SocketServer } from 'socket.io';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiProxy } from './api-proxy';

describe('API topology loopback proxy', () => {
  const backends: Server[] = [];
  let proxy: ReturnType<typeof createApiProxy>, sockets: SocketServer, origin: string;
  const listen = (server: Server) =>
    new Promise<number>((done) =>
      server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)),
    );
  beforeAll(async () => {
    const ports = [];
    for (const name of ['http-one', 'http-two', 'pvp']) {
      const server = createServer((request, response) => {
        const body: Buffer[] = [];
        request.on('data', (chunk: Buffer) => body.push(chunk));
        request.on('end', () => {
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              name,
              path: request.url,
              authenticated: request.headers.authorization === 'Bearer TEST_ONLY',
              bodyDigest: createHash('sha256').update(Buffer.concat(body)).digest('hex'),
            }),
          );
        });
      });
      backends.push(server);
      ports.push(await listen(server));
    }
    sockets = new SocketServer(backends[2]!);
    sockets.on('connection', (socket) =>
      socket.on('echo', (value: unknown, ack: (value: unknown) => void) => ack(value)),
    );
    proxy = createApiProxy(ports.slice(0, 2), ports[2]!);
    origin = 'http://127.0.0.1:' + (await listen(proxy.server));
  });
  afterAll(async () => {
    await proxy?.close();
    if (sockets) await new Promise<void>((done) => sockets.close(() => done()));
    for (const backend of backends) {
      backend.closeAllConnections();
      if (backend.listening) await new Promise<void>((done) => backend.close(() => done()));
    }
  });
  it('balances ordinary HTTP and pins PvP and documentation to the owner', async () => {
    const first = await (await fetch(origin + '/api/v1/identity/me')).json();
    const second = await (await fetch(origin + '/api/v1/identity/me')).json();
    expect([first.name, second.name]).toEqual(['http-one', 'http-two']);
    for (const path of [
      '/api/v1/pvp/availability?fresh=true',
      '/api/docs-json',
      '/socket.io/?EIO=4&transport=polling',
    ]) {
      if (path.startsWith('/socket.io')) continue;
      expect((await (await fetch(origin + path)).json()).name).toBe('pvp');
    }
    expect((await (await fetch(origin + '/api/v1/pvpx')).json()).name).toBe('http-one');
  });
  it('streams the full request body and retains the authorization header', async () => {
    const body = 'TEST_ONLY'.repeat(32000);
    const response = await fetch(origin + '/api/v1/assessment-attempts/test/answers/test', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer TEST_ONLY', 'Content-Type': 'application/json' },
      body,
    });
    const result = await response.json();
    expect(result.authenticated).toBe(true);
    expect(result.bodyDigest).toBe(createHash('sha256').update(body).digest('hex'));
  });
  it('retains real Socket.IO WebSocket and polling connections through the PvP owner', async () => {
    for (const transport of ['websocket', 'polling']) {
      const client = io(origin, { transports: [transport], reconnection: false, timeout: 3000 });
      try {
        await new Promise<void>((done, reject) => {
          client.once('connect', done);
          client.once('connect_error', reject);
        });
        const value = await client
          .timeout(2000)
          .emitWithAck('echo', { event: 'TEST_ONLY', sequence: 1 });
        expect(value).toEqual({ event: 'TEST_ONLY', sequence: 1 });
      } finally {
        client.close();
      }
    }
  });
  it('returns a bounded problem response when a selected HTTP backend is unavailable', async () => {
    for (const backend of backends.slice(0, 2)) {
      backend.closeAllConnections();
      await new Promise<void>((done) => backend.close(() => done()));
    }
    const response = await fetch(origin + '/api/v1/identity/me');
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Service unavailable',
      status: 503,
    });
  });
});
