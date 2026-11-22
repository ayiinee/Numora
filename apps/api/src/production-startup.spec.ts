import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer, type Socket } from 'node:net';
import { expect, it } from 'vitest';

const require = createRequire(resolve('../../packages/database/package.json'));
async function start(env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; output: string }>((done, reject) => {
    const child = spawn(
      process.execPath,
      ['--dns-result-order=ipv4first', require.resolve('tsx/cli'), resolve('src/main.ts')],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NUMORA_DEPLOYMENT_PROFILE: '',
          ALLOW_SYNTHETIC_CONTENT: 'false',
          DATABASE_MIGRATION_URL: '',
          PGOPTIONS: '',
          NODE_TLS_REJECT_UNAUTHORIZED: '1',
          NUMORA_IRT_DATABASE_URL: '',
          NEXT_PUBLIC_TEACHER_TOKEN_PEPPER: '',
          NEXT_PUBLIC_SUPABASE_URL: '',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
          ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (part: Buffer) => {
      output += part.toString();
    });
    child.stderr.on('data', (part: Buffer) => {
      output += part.toString();
    });
    const timer = setTimeout(() => child.kill(), 20000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}
it('exits before Nest/listen when an existing Production deployment has no explicit profile', async () => {
  const result = await start({
    DATABASE_URL: 'postgres://private:NEVER_PRINT_THIS@unused.example.test/db',
  });
  expect(result.code).toBe(1);
  expect(result.output).toContain('NUMORA_DEPLOYMENT_PROFILE');
  expect(result.output).not.toMatch(/NestFactory|NestApplication|NEVER_PRINT_THIS/);
}, 25000);

it('requires verified database transport before constructing the Nest application', async () => {
  const sockets = new Set<Socket>();
  let sslRequests = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.once('data', () => {
      sslRequests++;
      socket.end('N');
    });
  });
  await new Promise<void>((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Test TCP fixture missing');
  try {
    const result = await start({
      NUMORA_DEPLOYMENT_PROFILE: 'production-vps',
      DATABASE_URL: `postgres://numora_api:NEVER_PRINT_THIS@localhost:${address.port}/numora_production?sslmode=verify-full`,
      DATABASE_EXPECTED_HOST: 'localhost',
      DATABASE_EXPECTED_PORT: String(address.port),
      DATABASE_EXPECTED_NAME: 'numora_production',
      DATABASE_EXPECTED_USER: 'numora_api',
      DB_POOL_MAX: '1',
      SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST_ONLY',
      TEACHER_TOKEN_PEPPER: 'TEST ONLY preserved pepper',
      CORS_ORIGINS: 'https://app.example.test',
      REDIS_URL: 'rediss://default:TEST_ONLY@unused.example.test:6379',
      BULLMQ_PREFIX: 'numora:prod:startup-test',
      PVP_MODE: 'disabled',
      PVP_CONTENT_MODE: 'strict',
      NUMORA_OBSERVABILITY_ENABLED: 'false',
    });
    expect(result.code, result.output).toBe(1);
    expect(sslRequests).toBeGreaterThan(0);
    expect(result.output).toContain('Production database preflight failed');
    expect(result.output).not.toMatch(/NestFactory|NestApplication|NEVER_PRINT_THIS/);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
}, 25000);
