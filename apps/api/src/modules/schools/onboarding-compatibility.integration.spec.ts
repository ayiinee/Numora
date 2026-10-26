import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  classes as classTable,
  classMemberships,
  closeDatabaseConnection,
  getDatabase,
  teacherVerificationTokens,
  users,
} from '@tka/database';
import { IdentityService } from '../identity/identity.service';
import { ClassesService } from '../classes/classes.service';
import * as codes from '../classes/join-code';
import { SchoolsService } from './schools.service';
import * as tokens from './teacher-token';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
integration('onboarding compatibility and collision transactions', () => {
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => closeDatabaseConnection());
  async function fixture() {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { db } = getDatabase();
    const ids: Record<string, string> = {};
    const roles: Record<string, 'ADMIN' | 'TEACHER' | 'STUDENT'> = {
      admin: 'ADMIN',
      teacher: 'TEACHER',
      legacyTeacher: 'TEACHER',
      shortTeacher: 'TEACHER',
      studentA: 'STUDENT',
      studentB: 'STUDENT',
      studentC: 'STUDENT',
    };
    for (const [name, role] of Object.entries(roles)) {
      const [row] = await db
        .insert(users)
        .values({
          authUserId: randomUUID(),
          role,
          displayName: name,
          email: `${name}-${randomUUID()}@example.invalid`,
        })
        .returning({ id: users.id });
      ids[name] = row!.id;
    }
    const identity = {
      me: async (name: string) => ({
        id: ids[name],
        role: roles[name],
        status: 'ACTIVE',
        adminRole: name === 'admin' ? 'SUPER_ADMIN' : null,
        teacherVerified: true,
      }),
    } as unknown as IdentityService;
    const schools = new SchoolsService(identity);
    const classes = new ClassesService(identity);
    const school = await schools.createSchool(
      'admin',
      `COMPAT-${randomUUID()}`,
      'Demo Compatibility',
    );
    return { db, ids, schools, classes, school };
  }
  it('accepts case-sensitive legacy SHA-256 and unversioned HMAC tokens without rewriting hashes', async () => {
    const f = await fixture();
    const legacy = randomBytes(32).toString('base64url');
    const short = tokens.generateTeacherToken();
    const createdAt = new Date();
    const hashes = [
      createHash('sha256').update(legacy).digest('hex'),
      tokens.hashTeacherToken(short).slice(8),
    ];
    const rows = await f.db
      .insert(teacherVerificationTokens)
      .values(
        hashes.map((tokenHash) => ({
          schoolId: f.school.id,
          tokenHash,
          createdByUserId: f.ids.admin!,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 72 * 60 * 60 * 1000),
        })),
      )
      .returning({ id: teacherVerificationTokens.id });
    const newToken = tokens.generateTeacherToken();
    const generate = vi
      .spyOn(tokens, 'generateTeacherToken')
      .mockReturnValueOnce(short)
      .mockReturnValueOnce(newToken);
    expect((await f.schools.issueToken('admin', f.school.id)).token).toBe(newToken);
    expect(generate).toHaveBeenCalledTimes(2);
    generate.mockRestore();
    await expect(
      f.schools.verifyTeacher('legacyTeacher', f.school.id, legacy.toUpperCase()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.schools.verifyTeacher('legacyTeacher', f.school.id, ` ${legacy} `),
    ).resolves.toEqual({ verified: true });
    await expect(
      f.schools.verifyTeacher('shortTeacher', f.school.id, short.toLowerCase()),
    ).resolves.toEqual({ verified: true });
    for (let i = 0; i < rows.length; i++) {
      const [stored] = await f.db
        .select()
        .from(teacherVerificationTokens)
        .where(eq(teacherVerificationTokens.id, rows[i]!.id));
      expect(stored!.tokenHash).toBe(hashes[i]);
      expect(stored!.usedAt).not.toBeNull();
    }
  });
  it('retries a token collision, preserves 72h expiry, and rolls back reissue when all collisions fail', async () => {
    const f = await fixture();
    const original = await f.schools.issueToken('admin', f.school.id);
    expect(original.token).toHaveLength(8);
    const next = tokens.generateTeacherToken();
    const generate = vi
      .spyOn(tokens, 'generateTeacherToken')
      .mockReturnValueOnce(original.token)
      .mockReturnValueOnce(next);
    const replacement = await f.schools.reissueToken('admin', f.school.id, original.id);
    expect(replacement.token).toBe(next);
    expect(generate).toHaveBeenCalledTimes(2);
    await expect(
      f.schools.verifyTeacher('teacher', f.school.id, original.token),
    ).rejects.toMatchObject({ status: 403 });
    const [stored] = await f.db
      .select()
      .from(teacherVerificationTokens)
      .where(eq(teacherVerificationTokens.id, replacement.id));
    expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(72 * 60 * 60 * 1000);
    expect(stored!.tokenHash).toMatch(/^hmac-v1:/);
    generate.mockReturnValue(original.token);
    await expect(
      f.schools.reissueToken('admin', f.school.id, replacement.id),
    ).rejects.toMatchObject({ status: 503 });
    const [unchanged] = await f.db
      .select()
      .from(teacherVerificationTokens)
      .where(eq(teacherVerificationTokens.id, replacement.id));
    expect(unchanged!.revokedAt).toBeNull();
    await expect(
      f.schools.verifyTeacher('teacher', f.school.id, replacement.token.toLowerCase()),
    ).resolves.toEqual({ verified: true });
  });
  it('keeps shared class codes reusable, supports legacy codes, and permits concurrent joins below the five-class cap', async () => {
    const f = await fixture();
    const issued = await f.schools.issueToken('admin', f.school.id);
    await f.schools.verifyTeacher('teacher', f.school.id, issued.token);
    const first = await f.classes.create('teacher', 'IX A');
    expect(first.joinCode).toHaveLength(6);
    await f.classes.join('studentA', first.joinCode.toLowerCase());
    await f.classes.join('studentB', first.joinCode);
    await expect(f.classes.join('studentA', first.joinCode)).resolves.toMatchObject({
      joined: true,
    });
    const second = await f.classes.create('teacher', 'IX B');
    const legacyCode = `QA_${randomUUID().slice(0, 8).toUpperCase()}-CLASS`;
    await f.db.update(classTable).set({ joinCode: legacyCode }).where(eq(classTable.id, second.id));
    const race = await Promise.allSettled([
      f.classes.join('studentC', first.joinCode),
      f.classes.join('studentC', legacyCode.toLowerCase()),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(
      await f.db
        .select()
        .from(classMemberships)
        .where(and(eq(classMemberships.studentUserId, f.ids.studentC!))),
    ).toHaveLength(2);
    const other = codes.generateClassJoinCode();
    const generate = vi
      .spyOn(codes, 'generateClassJoinCode')
      .mockReturnValueOnce(first.joinCode)
      .mockReturnValueOnce(other);
    expect((await f.classes.create('teacher', 'IX C')).joinCode).toBe(other);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
