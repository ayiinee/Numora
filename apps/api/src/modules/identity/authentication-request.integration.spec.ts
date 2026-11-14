import { createServer, type Server } from 'node:http';
import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  Inject,
  Injectable,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from './identity.service';

@Injectable()
class VerifiedGuard implements CanActivate {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  async canActivate(context: ExecutionContext) {
    await this.identity.authenticate(
      context.switchToHttp().getRequest<{ headers: { authorization?: string } }>().headers
        .authorization,
    );
    return true;
  }
}
@Controller('test-auth')
@UseGuards(VerifiedGuard)
class AuthenticationFixtureController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}
  @Get('sequential')
  async sequential(@Headers('authorization') auth?: string) {
    const first = await this.identity.authenticate(auth),
      second = await this.identity.authenticate(auth);
    return { ids: [first.id, second.id] };
  }
  @Get('parallel')
  async parallel(@Headers('authorization') auth?: string) {
    const users = await Promise.all(
      Array.from({ length: 20 }, () => this.identity.authenticate(auth)),
    );
    return { ids: users.map((user) => user.id) };
  }
  @Get('mixed')
  async mixed(
    @Headers('authorization') auth?: string,
    @Headers('x-other-authorization') other?: string,
  ) {
    const users = await Promise.all([
      this.identity.authenticate(auth),
      this.identity.authenticate(other),
      this.identity.authenticate(auth),
    ]);
    return { ids: users.map((user) => user.id) };
  }
}

describe('request identity sharing through configured HTTP middleware and real Auth SDK', () => {
  let provider: Server, app: INestApplication, base: string;
  let calls = 0,
    responseBodyBytes = 0,
    revoked = false;
  const ids = {
    a: '00000000-0000-4000-8000-000000000001',
    b: '00000000-0000-4000-8000-000000000002',
  };
  const prior = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  };
  beforeAll(async () => {
    provider = createServer((req, res) => {
      if (req.url !== '/auth/v1/user') {
        res.writeHead(404).end();
        return;
      }
      calls++;
      const who = req.headers.authorization === 'Bearer fixture-b' ? 'b' : 'a';
      const valid =
        !revoked &&
        ['Bearer fixture-a', 'Bearer fixture-b'].includes(req.headers.authorization ?? '');
      const body = JSON.stringify(
        valid
          ? {
              id: ids[who],
              aud: 'authenticated',
              role: 'authenticated',
              app_metadata: { provider: 'google' },
              user_metadata: { privateFixture: 'X'.repeat(4096) },
              created_at: '2026-11-14T00:00:00Z',
            }
          : { code: 'bad_jwt', msg: 'Invalid token' },
      );
      responseBodyBytes += Buffer.byteLength(body);
      res
        .writeHead(valid ? 200 : 401, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        })
        .end(body);
    });
    await new Promise<void>((done) => provider.listen(0, '127.0.0.1', done));
    const address = provider.address();
    if (!address || typeof address === 'string') throw new Error('TEST provider missing');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_fixture';
    const module = await Test.createTestingModule({
      controllers: [AuthenticationFixtureController],
      providers: [IdentityService, VerifiedGuard],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (provider) {
      provider.closeAllConnections();
      await new Promise<void>((done) => provider.close(() => done()));
    }
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const call = (path: string, token = 'fixture-a', other?: string) =>
    fetch(`${base}/api/v1/test-auth/${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        ...(other ? { 'x-other-authorization': `Bearer ${other}` } : {}),
      },
    });

  it('verifies only once across guard/controller and parallel callers per request', async () => {
    const results = [];
    for (const [path, identities] of [
      ['sequential', 2],
      ['parallel', 20],
    ] as const) {
      calls = 0;
      responseBodyBytes = 0;
      const response = await call(path);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ids: Array.from({ length: identities }, () => ids.a),
      });
      results.push({ path, providerCalls: calls, authResponseBodyBytes: responseBodyBytes });
    }
    console.info(JSON.stringify({ measurement: 'http_request_auth_dedup', results }));
    for (const result of results) expect(result.providerCalls).toBe(1);
  });
  it('keeps different tokens and overlapping HTTP requests isolated', async () => {
    const mixed = await call('mixed', 'fixture-a', 'fixture-b');
    expect(await mixed.json()).toEqual({ ids: [ids.a, ids.b, ids.a] });
    const responses = await Promise.all([
      call('parallel', 'fixture-a'),
      call('parallel', 'fixture-b'),
      call('parallel', 'fixture-a'),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies).toEqual(
      [ids.a, ids.b, ids.a].map((id) => ({ ids: Array.from({ length: 20 }, () => id) })),
    );
  });
  it('revalidates a later request and rejects revoked tokens', async () => {
    expect((await call('sequential')).status).toBe(200);
    revoked = true;
    try {
      const response = await call('sequential');
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toMatch(/fixture-a|privateFixture/);
    } finally {
      revoked = false;
    }
  });
  it('rejects absent and malformed bearer headers before provider access', async () => {
    calls = 0;
    for (const authorization of [undefined, 'Basic fixture-a', 'Bearer two tokens']) {
      const response = await fetch(`${base}/api/v1/test-auth/sequential`, {
        headers: authorization ? { authorization } : {},
      });
      expect(response.status).toBe(401);
    }
    expect(calls).toBe(0);
  });
});
