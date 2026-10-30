import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection } from 'node:net';
import { createFaultProxy } from './fault-proxy.mjs';
function exchange(url, message) {
  const target = new URL(url);
  return new Promise((ready, reject) => {
    const socket = createConnection({ host: target.hostname, port: Number(target.port) });
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else ready(data);
    };
    socket.setTimeout(1000, () => finish(new Error('Connection timeout')));
    socket.once('connect', () => socket.write(message));
    socket.once('data', (data) => finish(null, data.toString()));
    socket.once('error', (error) => finish(error));
    socket.once('close', () => {
      if (!settled) finish(new Error('Connection closed'));
    });
  });
}
test('proxy forwards to original upstream, rejects while blocked, and recovers without restarting it', async () => {
  let received = 0;
  const upstream = createServer((socket) => {
    socket.on('error', () => {});
    socket.on('data', (data) => {
      received++;
      socket.write('echo:' + data);
    });
  });
  await new Promise((ready) => upstream.listen(0, '127.0.0.1', ready));
  const proxy = await createFaultProxy('redis://127.0.0.1:' + upstream.address().port);
  try {
    assert.equal(await exchange(proxy.url, 'before'), 'echo:before');
    proxy.block();
    await assert.rejects(exchange(proxy.url, 'blocked'));
    assert.equal(proxy.rejectedConnections(), 1);
    assert.equal(received, 1);
    proxy.restore();
    assert.equal(await exchange(proxy.url, 'after'), 'echo:after');
    assert.equal(received, 2);
  } finally {
    await proxy.close();
    await new Promise((ready) => upstream.close(ready));
  }
});
test('fault proxy rejects remote services and unsupported protocols before binding', async () => {
  for (const url of [
    'redis://cloud.example:6379',
    'postgres://127.0.0.1.example:5432/test',
    'https://127.0.0.1:443',
  ])
    await assert.rejects(createFaultProxy(url), /LOCAL_TEST_SERVICE/);
});
