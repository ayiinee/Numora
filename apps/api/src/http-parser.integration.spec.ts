import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';

it('keeps the installed HTTP parser alive after compressed trailing bytes and preserves JSON limits', async () => {
  const require = createRequire(resolve('package.json'));
  const express = createRequire(require.resolve('@nestjs/platform-express')).resolve('express');
  const script = `const express=require(${JSON.stringify(express)});
    const app=express();app.use(express.json({limit:'2mb'}));
    app.get('/health',(_q,r)=>r.sendStatus(200));app.post('/body',(_q,r)=>r.sendStatus(201));
    app.use((e,_q,r,_n)=>r.sendStatus(e.status||500));
    const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
    process.on('message',()=>server.close(()=>process.exit(0)));`;
  const child = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', (b) => {
    stderr += b;
  });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('HTTP fixture startup timeout')), 5000);
      child.once('message', (message) => {
        clearTimeout(timer);
        resolve((message as { port: number }).port);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`HTTP fixture exited ${code}: ${stderr}`));
      });
      child.once('error', reject);
    });
    const url = `http://127.0.0.1:${port}`;
    const send = (body: string | Buffer, headers = {}) =>
      fetch(url + '/body', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: body as BodyInit,
        signal: AbortSignal.timeout(3000),
      });
    expect((await send('{}')).status).toBe(201);
    expect((await send('{')).status).toBe(400);
    expect((await send(JSON.stringify({ value: 'x'.repeat(2 * 1024 * 1024) }))).status).toBe(413);
    expect((await send(gzipSync('{}'), { 'content-encoding': 'gzip' })).status).toBe(201);
    const response = await send(
      Buffer.concat([gzipSync('{}'), Buffer.from('TEST ONLY trailing bytes')]),
      { 'content-encoding': 'gzip' },
    );
    expect([201, 400]).toContain(response.status);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(child.exitCode, stderr).toBeNull();
    expect((await fetch(url + '/health', { signal: AbortSignal.timeout(3000) })).status).toBe(200);
  } finally {
    if (child.exitCode === null) {
      child.send('stop');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}, 15000);
