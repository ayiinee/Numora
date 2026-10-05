import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApplication } from '../../bootstrap';
import { SchoolsModule } from '../schools/schools.module';
import { SchoolsService } from '../schools/schools.service';
import { ClassesModule } from '../classes/classes.module';
import { ClassesService } from '../classes/classes.service';
import { IdentityService } from '../identity/identity.service';
import { CodeAttemptLimiter } from './code-attempt-limiter';

const schoolId = '33333333-3333-4333-8333-333333333333';
describe('short-code HTTP boundaries', () => {
  let app: INestApplication;
  let url: string;
  const identity = { me: vi.fn() };
  const schools = { verifyTeacher: vi.fn() };
  const classes = { join: vi.fn(), takeover: vi.fn() };
  const limiter = { consume: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [SchoolsModule, ClassesModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .overrideProvider(SchoolsService)
      .useValue(schools)
      .overrideProvider(ClassesService)
      .useValue(classes)
      .overrideProvider(CodeAttemptLimiter)
      .useValue(limiter)
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.resetAllMocks();
    identity.me.mockResolvedValue({ id: 'actor', role: 'TEACHER' });
    schools.verifyTeacher.mockResolvedValue({ verified: true });
    classes.join.mockResolvedValue({ joined: true, class: { id: schoolId, name: 'IX A' } });
    classes.takeover.mockResolvedValue({ id: schoolId, name: 'IX A', joinCode: 'ABCD23' });
    limiter.consume.mockResolvedValue(undefined);
  });
  const post = (path: string, body: unknown) =>
    fetch(`${url}/api/v1/${path}`, {
      method: 'POST',
      headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  it('accepts new/legacy teacher tokens and rejects unsupported formats through the real DTO', async () => {
    for (const token of ['abcd2345', 'AbCdEfGh_1234567890-abcdefghXYZijklm']) {
      expect((await post(`schools/${schoolId}/teacher-verifications`, { token })).status).toBe(201);
    }
    for (const token of ['ABC1234', 'ABC123456', 'abcd!!!!'])
      expect((await post(`schools/${schoolId}/teacher-verifications`, { token })).status).toBe(400);
    expect(schools.verifyTeacher).toHaveBeenCalledTimes(2);
    expect(limiter.consume).toHaveBeenCalledWith(`teacher:actor:${schoolId}`, 5);
  });
  it('accepts short and legacy/QA class codes while preserving input for service normalization', async () => {
    identity.me.mockResolvedValue({ id: 'student', role: 'STUDENT' });
    for (const joinCode of ['abc234', 'DEMO-QA-CLASS-A', 'ABCD_EFG-H1234'])
      expect((await post('classes/join', { joinCode })).status).toBe(201);
    for (const joinCode of ['ABCD', 'ABCD234', 'BAD!CODE'])
      expect((await post('classes/join', { joinCode })).status).toBe(400);
    expect(classes.join).toHaveBeenCalledTimes(3);
    expect(limiter.consume).toHaveBeenCalledWith('class:student', 10);
  });
  it('returns problem+json with Retry-After and prevents the business mutation', async () => {
    limiter.consume.mockRejectedValue(
      new HttpException({ code: 'CODE_ATTEMPT_LIMIT', detail: 'Wait.', retryAfter: 42 }, 429),
    );
    const response = await post(`schools/${schoolId}/teacher-verifications`, { token: 'ABCD2345' });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({ code: 'CODE_ATTEMPT_LIMIT', status: 429 });
    expect(schools.verifyTeacher).not.toHaveBeenCalled();
  });
  it('allows Teacher takeover with a separate limiter scope while rejecting Student and Admin', async () => {
    expect((await post('classes/takeover', { joinCode: 'ABCD23' })).status).toBe(201);
    expect(limiter.consume).toHaveBeenCalledWith('class-takeover:actor', 10);
    expect(classes.takeover).toHaveBeenCalledTimes(1);
    limiter.consume.mockClear();
    for (const role of ['STUDENT', 'ADMIN']) {
      identity.me.mockResolvedValue({ id: 'other', role });
      expect((await post('classes/takeover', { joinCode: 'ABCD23' })).status).toBe(403);
    }
    expect(limiter.consume).not.toHaveBeenCalled();
    expect(classes.takeover).toHaveBeenCalledTimes(1);
  });
  it('fails takeover closed when its code limiter is unavailable', async () => {
    limiter.consume.mockRejectedValue(
      new ServiceUnavailableException({ code: 'CODE_LIMITER_UNAVAILABLE' }),
    );
    expect((await post('classes/takeover', { joinCode: 'ABCD23' })).status).toBe(503);
    expect(classes.takeover).not.toHaveBeenCalled();
  });
  it('fails closed on limiter outage and rejects unauthorized roles before limiting', async () => {
    identity.me.mockResolvedValue({ id: 'student', role: 'STUDENT' });
    limiter.consume.mockRejectedValue(
      new ServiceUnavailableException({ code: 'CODE_LIMITER_UNAVAILABLE' }),
    );
    expect((await post('classes/join', { joinCode: 'ABCD23' })).status).toBe(503);
    expect(classes.join).not.toHaveBeenCalled();
    limiter.consume.mockClear();
    expect(
      (await post(`schools/${schoolId}/teacher-verifications`, { token: 'ABCD2345' })).status,
    ).toBe(403);
    expect(limiter.consume).not.toHaveBeenCalled();
    identity.me.mockRejectedValue(new UnauthorizedException());
    expect((await post('classes/join', { joinCode: 'ABCD23' })).status).toBe(401);
  });
});
