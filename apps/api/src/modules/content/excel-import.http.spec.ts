import {
  ServiceUnavailableException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { configureApplication } from '../../bootstrap';
import { IdentityService } from '../identity/identity.service';
import { ContentAdminGuard } from '../identity/content-admin.guard';
import { ExcelImportController } from './excel-import.controller';
import { ExcelImportService } from './excel-import.service';
import { ContentImportService } from './content-import.service';
import { ContentService } from './content.service';
import { readFile } from 'node:fs/promises';

describe('Excel HTTP boundary with real guard, validation and parser; no database writes', () => {
  let app: INestApplication, base: string;
  let enabled = true;
  const validate = vi.fn(
    async (body: { sourceNamespace: string; questions: { externalId: string }[] }) => ({
      id: null,
      sourceNamespace: body.sourceNamespace,
      canImportDraft: true,
      items: body.questions.map((q) => ({
        externalId: q.externalId,
        canImportDraft: true,
        canPreview: false,
        blockers: ['MEDIA_NOT_READY'],
        outcome: 'VALIDATED',
        questionVersionId: null,
      })),
    }),
  );
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ExcelImportController],
      providers: [
        ExcelImportService,
        ContentAdminGuard,
        {
          provide: ContentImportService,
          useValue: {
            enabled: () => {
              if (!enabled) throw new ServiceUnavailableException();
            },
            validate,
          },
        },
        { provide: ContentService, useValue: { curriculum: async () => ({ items: [] }) } },
        { provide: ConfigService, useValue: new ConfigService() },
        {
          provide: IdentityService,
          useValue: {
            me: async (header: string | undefined) => {
              if (!header) throw new UnauthorizedException();
              return {
                id: 'TEST',
                role: 'ADMIN',
                status: 'ACTIVE',
                adminRole: header === 'Bearer ops' ? 'OPERATIONS' : 'CONTENT_DATA_MODERATION',
              };
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  async function parse(
    token = 'admin',
    namespace = 'TEST',
    data?: Uint8Array,
    name = 'questions.xlsx',
  ) {
    const body = new FormData();
    body.append('sourceNamespace', namespace);
    body.append(
      'file',
      new Blob([
        new Uint8Array(
          data ?? (await readFile('src/modules/content/fixtures/excel-v3-mixed.xlsx')),
        ),
      ]),
      name,
    );
    return fetch(base + '/api/v1/admin/content/excel-parses', {
      method: 'POST',
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }
  it('denies missing authentication and Operations on parse and template endpoints', async () => {
    expect((await parse('')).status).toBe(401);
    expect((await parse('ops')).status).toBe(403);
    expect(
      (
        await fetch(base + '/api/v1/admin/content/excel-template', {
          headers: { Authorization: 'Bearer ops' },
        })
      ).status,
    ).toBe(403);
    expect(validate).not.toHaveBeenCalled();
  });
  it('parses multipart content and downloads a native template for authorized content Admins', async () => {
    const response = await parse();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.issues).toEqual([]);
    expect(body.envelope.questions).toHaveLength(6);
    expect(body.media).toHaveLength(18);
    const template = await fetch(base + '/api/v1/admin/content/excel-template', {
      headers: { Authorization: 'Bearer admin' },
    });
    expect(template.status).toBe(200);
    expect(template.headers.get('content-type')).toContain('spreadsheetml');
    expect(
      Buffer.from(await template.arrayBuffer())
        .subarray(0, 4)
        .toString('hex'),
    ).toBe('504b0304');
  });
  it('rejects invalid namespace, .xls and oversized upload using problem+json', async () => {
    expect((await parse('admin', 'bad namespace')).status).toBe(400);
    expect((await parse('admin', 'TEST', new Uint8Array([1]), 'questions.xls')).status).toBe(400);
    const tooLarge = await parse('admin', 'TEST', new Uint8Array(10 * 1024 * 1024 + 1));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.headers.get('content-type')).toContain('application/problem+json');
    enabled = false;
    expect((await parse()).status).toBe(503);
    enabled = true;
  });
});
