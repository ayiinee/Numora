import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { ClassesService } from './classes.service';

vi.mock('@tka/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tka/database')>();
  return { ...actual, getDatabase: vi.fn() };
});

const teacherId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const ownedClass = {
  classId,
  className: 'IX A',
  verifiedSchool: true,
  activeSchool: true,
  teacherUserId: teacherId,
  archivedAt: null,
};

function database(...results: unknown[][]) {
  const read = vi.fn(() => results.shift() ?? []);
  const select = vi.fn(() => {
    const rows = read();
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: async () => rows,
      limit: async () => rows,
    };
    return query;
  });
  vi.mocked(getDatabase).mockReturnValue({ db: { select }, client: async () => read() } as never);
  return read;
}

function service(profile = { id: teacherId, role: 'TEACHER', teacherVerified: true }) {
  const identity = { me: vi.fn().mockResolvedValue(profile) };
  return new ClassesService(identity as unknown as IdentityService);
}

beforeEach(() => vi.clearAllMocks());

describe('ClassesService Teacher reads', () => {
  it('rejects an invalid session before querying Class data', async () => {
    const identity = { me: vi.fn().mockRejectedValue(new UnauthorizedException()) };
    await expect(
      new ClassesService(identity as unknown as IdentityService).list('Bearer bad'),
    ).rejects.toThrow(UnauthorizedException);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('rejects Student and unverified Teacher before querying Class data', async () => {
    await expect(
      service({ id: teacherId, role: 'STUDENT', teacherVerified: false }).list('Bearer ok'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service({ id: teacherId, role: 'TEACHER', teacherVerified: false }).list('Bearer ok'),
    ).rejects.toThrow(ForbiddenException);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('returns owned active Classes in the public response shape', async () => {
    database([
      { id: classId, name: 'IX A' },
      { id: 'other-id', name: 'IX B' },
    ]);
    await expect(service().list('Bearer ok')).resolves.toEqual({
      items: [
        { id: classId, name: 'IX A' },
        { id: 'other-id', name: 'IX B' },
      ],
    });
  });

  it('rejects another Teacher’s Class before querying its Students', async () => {
    const select = database([{ ...ownedClass, teacherUserId: 'another-teacher' }]);
    await expect(service().students('Bearer ok', classId)).rejects.toThrow(ForbiddenException);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('rejects archived Classes and an ended school membership', async () => {
    database([{ ...ownedClass, archivedAt: new Date() }]);
    await expect(service().students('Bearer ok', classId)).rejects.toThrow(NotFoundException);
    database([{ ...ownedClass, verifiedSchool: false }]);
    await expect(service().students('Bearer ok', classId)).rejects.toThrow(ForbiddenException);
  });

  it('returns only the Class and Student identity fields after authorization', async () => {
    database([ownedClass], [{ id: 'student-id', displayName: 'Nisa' }]);
    await expect(service().students('Bearer ok', classId)).resolves.toEqual({
      class: { id: classId, name: 'IX A' },
      items: [{ id: 'student-id', displayName: 'Nisa' }],
    });
  });

  it('protects the banned roster with the same ownership and active-school checks', async () => {
    const select = database([{ ...ownedClass, teacherUserId: 'another-teacher' }]);
    await expect(service().bannedStudents('Bearer ok', classId)).rejects.toThrow(
      ForbiddenException,
    );
    expect(select).toHaveBeenCalledTimes(1);
    database([{ ...ownedClass, verifiedSchool: false }]);
    await expect(service().bannedStudents('Bearer ok', classId)).rejects.toThrow(
      ForbiddenException,
    );
    database([{ ...ownedClass, activeSchool: false }]);
    await expect(service().bannedStudents('Bearer ok', classId)).rejects.toThrow(
      ForbiddenException,
    );
    database([ownedClass], [], [{ id: 'student', displayName: 'Nisa' }]);
    await expect(service().bannedStudents('Bearer ok', classId)).resolves.toEqual({
      class: { id: classId, name: 'IX A' },
      items: [{ id: 'student', displayName: 'Nisa' }],
    });
  });
});
