import { AdminController } from '../admin/admin.controller';
import { AdminService } from '../admin/admin.service';
import { AdminAnalyticsService } from '../admin/analytics.service';
import { IrtOperationsService } from '../irt/irt-operations.service';
import { PretestController } from '../content/pretest.controller';
import { PretestService } from '../content/pretest.service';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { configureApplication } from '../../bootstrap';
import { AdminGuard } from './admin.guard';
import { ContentAdminGuard } from './content-admin.guard';
import { IdentityService } from './identity.service';
import { AdminOperationsController } from '../admin/operations.controller';
import { AdminOperationsService } from '../admin/operations.service';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';
import { IrtController } from '../irt/irt.controller';
import { IrtService } from '../irt/irt.service';
import { IrtRequestsService } from '../irt/irt-requests.service';
import { SchoolsService } from '../schools/schools.service';
import { adminCapabilities } from './admin-capabilities';
import { AdminAccountsController } from '../admin/accounts.controller';
import { AdminAccountsService } from '../admin/accounts.service';
import { AdminStructuresController } from '../admin/structures.controller';
import { AdminStructuresService } from '../admin/structures.service';
import { AdminSchoolsController } from '../schools/admin-schools.controller';
import { ContentController } from '../content/content.controller';
import { ContentService } from '../content/content.service';
import { AssessmentPoliciesService } from '../content/assessment-policies.service';
import { MediaUploadsController } from '../content/media-uploads.controller';
import { MediaUploadsService } from '../content/media-uploads.service';
import { ClassesService } from '../classes/classes.service';

describe('Admin v0.6 authorization through direct HTTP', () => {
  let app: INestApplication;
  let base: string;
  let assignment: string | null = null;
  let status = 'ACTIVE';
  const users = vi.fn(() => ({ items: [], nextOffset: null }));
  const reports = vi.fn(() => ({ items: [] }));
  const prepare = vi.fn(() => ({ id: 'test-request' }));
  const identity = {
    me: vi.fn(async () => ({
      id: 'test-admin',
      role: 'ADMIN',
      status,
      adminRole: assignment,
    })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        PretestController,
        AdminController,
        AdminOperationsController,
        ReportsController,
        IrtController,
        AdminAccountsController,
        AdminStructuresController,
        AdminSchoolsController,
        ContentController,
        MediaUploadsController,
      ],
      providers: [
        AdminGuard,
        { provide: AdminService, useValue: { dashboard: reports, audit: reports } },
        { provide: AdminAnalyticsService, useValue: { summary: reports } },
        ContentAdminGuard,
        { provide: PretestService, useValue: { list: reports, blueprints: reports } },
        { provide: IdentityService, useValue: identity },
        { provide: AdminOperationsService, useValue: { users, roster: users, memberships: users } },
        { provide: SchoolsService, useValue: { listForAdmin: users, listTokens: users } },
        { provide: ContentService, useValue: { curriculum: reports } },
        { provide: AssessmentPoliciesService, useValue: { list: reports } },
        { provide: MediaUploadsService, useValue: { reserve: prepare } },
        { provide: AdminAccountsService, useValue: { accounts: users } },
        { provide: AdminStructuresService, useValue: { schools: users, classes: users } },
        { provide: ReportsService, useValue: { list: reports } },
        { provide: IrtService, useValue: { list: reports } },
        { provide: IrtRequestsService, useValue: { prepare } },
        { provide: IrtOperationsService, useValue: { options: reports, health: reports } },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()) + '/api/v1';
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each([
    ['SUPER_ADMIN', 200, 200],
    ['OPERATIONS', 200, 403],
    ['CONTENT_DATA_MODERATION', 403, 200],
    [null, 403, 403],
  ])('enforces the operations/moderation matrix for %s', async (role, operations, content) => {
    assignment = role as string | null;
    expect(
      (await fetch(base + '/admin/analytics', { headers: { Authorization: 'Bearer unchanged' } }))
        .status,
    ).toBe(role ? 200 : 403);
    expect(
      (await fetch(base + '/admin/users', { headers: { Authorization: 'Bearer unchanged' } }))
        .status,
    ).toBe(operations);
    const id = '00000000-0000-4000-8000-000000000001';
    for (const path of [
      '/admin/schools',
      `/admin/schools/${id}/teacher-tokens`,
      `/admin/classes/${id}/roster`,
      `/admin/users/${id}/memberships`,
    ])
      expect(
        (await fetch(base + path, { headers: { Authorization: 'Bearer unchanged' } })).status,
      ).toBe(operations);
    expect(
      (await fetch(base + '/admin/reports', { headers: { Authorization: 'Bearer unchanged' } }))
        .status,
    ).toBe(content);
    for (const path of [
      '/admin/content/pretest-packages',
      '/admin/content/pretest-packages/blueprints',
      '/admin/irt/options',
      '/admin/irt/batch-health',
      '/admin/content/curriculum',
      '/admin/content/assessment-policies',
    ])
      expect(
        (await fetch(base + path, { headers: { Authorization: 'Bearer unchanged' } })).status,
      ).toBe(content);
    expect(
      (await fetch(base + '/admin/irt', { headers: { Authorization: 'Bearer unchanged' } })).status,
    ).toBe(content);
    expect(
      (await fetch(base + '/admin/accounts', { headers: { Authorization: 'Bearer unchanged' } }))
        .status,
    ).toBe(role === 'SUPER_ADMIN' ? 200 : 403);
    expect(
      (
        await fetch(base + '/admin/structures/classes', {
          headers: { Authorization: 'Bearer unchanged' },
        })
      ).status,
    ).toBe(role ? 200 : 403);
  });
  it('rechecks assignment on the next request with an unchanged token', async () => {
    assignment = 'SUPER_ADMIN';
    const headers = { Authorization: 'Bearer unchanged' };
    const allowed = await fetch(base + '/admin/users', { headers });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('X-Numora-Admin-Role')).toBe('SUPER_ADMIN');
    assignment = 'OPERATIONS';
    expect(
      (await fetch(base + '/admin/users', { headers })).headers.get('X-Numora-Admin-Role'),
    ).toBe('OPERATIONS');
    assignment = 'CONTENT_DATA_MODERATION';
    expect((await fetch(base + '/admin/users', { headers })).status).toBe(403);
  });
  it('rejects Operations IRT mutation before DTO validation or service execution', async () => {
    assignment = 'OPERATIONS';
    const response = await fetch(base + '/admin/irt/requests', {
      method: 'POST',
      headers: { Authorization: 'Bearer unchanged', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('rejects Content school mutation before a database connection', async () => {
    assignment = 'CONTENT_DATA_MODERATION';
    const service = new SchoolsService(identity as unknown as IdentityService);
    await expect(service.createSchool('Bearer unchanged', 'TEST', 'Test')).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(['CONTENT_DATA_MODERATION', 'OPERATIONS', null])(
    'denies mutations outside the assignment for %s before service execution',
    async (role) => {
      assignment = role;
      const paths =
        role === 'CONTENT_DATA_MODERATION'
          ? ['/admin/schools', '/admin/schools/00000000-0000-4000-8000-000000000001/teacher-tokens']
          : ['/admin/content/chapters', '/admin/content/media/uploads'];
      for (const path of [...paths, '/admin/invitations'])
        expect(
          (
            await fetch(base + path, {
              method: 'POST',
              headers: { Authorization: 'Bearer unchanged', 'Content-Type': 'application/json' },
              body: '{}',
            })
          ).status,
        ).toBe(403);
    },
  );
  it.each(['SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION'] as const)(
    'never grants ban/unban to %s, including the Teacher endpoint',
    async (role) => {
      assignment = role;
      const service = new ClassesService(identity as unknown as IdentityService);
      for (const banned of [true, false])
        await expect(
          service.setBan('Bearer unchanged', 'class', 'student', banned),
        ).rejects.toMatchObject({ status: 403 });
    },
  );
  it('rejects a disabled admin with a still-valid token', async () => {
    assignment = 'SUPER_ADMIN';
    status = 'DISABLED';
    expect(
      (await fetch(base + '/admin/analytics', { headers: { Authorization: 'Bearer unchanged' } }))
        .status,
    ).toBe(403);
    status = 'ACTIVE';
  });
  it('never derives unknown-role or non-Admin permissions from browser capabilities', () => {
    expect(adminCapabilities(null)).toEqual([]);
    expect(adminCapabilities('toString')).toEqual([]);
    expect(adminCapabilities('OPERATIONS')).not.toContain('CONTENT_MANAGE');
  });
});
