import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { IdentityService } from '../identity/identity.service';

const serviceFor = (adminRole: string | null, status = 'ACTIVE') =>
  new SchoolsService({
    me: vi.fn().mockResolvedValue({
      id: 'admin-id',
      role: 'ADMIN',
      status,
      adminRole,
    }),
  } as unknown as IdentityService);

describe('SchoolsService Admin permissions', () => {
  it('denies Content/Data/Moderation access to school and teacher credential operations', async () => {
    const schools = serviceFor('CONTENT_DATA_MODERATION');
    const operations = [
      () => schools.createSchool('token', 'SCHOOL', 'School'),
      () => schools.updateSchool('token', 'school-id', { status: 'INACTIVE' }),
      () => schools.issueToken('token', 'school-id'),
      () => schools.listTokens('token', 'school-id'),
      () => schools.revokeToken('token', 'school-id', 'token-id'),
      () => schools.reissueToken('token', 'school-id', 'token-id'),
    ];

    for (const operation of operations)
      await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an active subrole for operational access', async () => {
    await expect(serviceFor(null).listForAdmin('token')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(serviceFor('OPERATIONS', 'DISABLED').listForAdmin('token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
