import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { closeDatabaseConnection, getDatabase } from '@tka/database';
import { IdentityService } from './identity.service';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'live account projection against PostgreSQL',
  () => {
    afterAll(async () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await closeDatabaseConnection();
    });

    it('rechecks membership, school status, subrole and disabled accounts on every read', async () => {
      const url = new URL(process.env.TEST_DATABASE_URL!);
      if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error('Dedicated localhost PostgreSQL required');
      vi.stubEnv('DATABASE_URL', url.href);
      const { client } = getDatabase();
      const actors = new Map<string, { id: string; authId: string }>();
      for (const [name, role] of [
        ['student', 'STUDENT'],
        ['teacher', 'TEACHER'],
        ['admin', 'ADMIN'],
      ]) {
        const authId = randomUUID();
        const [row] = await client`
        insert into public.users (auth_user_id, role, display_name, email)
        values (${authId}, ${role!}, 'TEST ONLY identity', ${authId + '@example.test'}) returning id
      `;
        actors.set(name!, { id: row!.id, authId });
      }
      const service = new IdentityService();
      vi.spyOn(service, 'authenticate').mockImplementation(
        async (authorization) =>
          ({
            id: actors.get(authorization!)?.authId ?? randomUUID(),
          }) as User,
      );
      const student = actors.get('student')!;
      const teacher = actors.get('teacher')!;
      const admin = actors.get('admin')!;
      expect(await service.getProfile('student')).toMatchObject({
        id: student.id,
        role: 'STUDENT',
        studentAffiliation: 'MANDIRI',
        teacherVerified: null,
      });
      expect(await service.getProfile('teacher')).toMatchObject({ teacherVerified: false });
      const [school] = await client`
      insert into public.schools (code, name) values (${randomUUID()}, 'TEST ONLY school') returning id
    `;
      const [token] = await client`
      insert into public.teacher_verification_tokens
        (school_id, token_hash, created_by_user_id, expires_at, used_at, used_by_user_id)
      values (${school!.id}, ${randomUUID()}, ${admin.id}, now()+interval '24 hours', now(), ${teacher.id})
      returning id
    `;
      await client`
      insert into public.teacher_school_memberships (teacher_user_id, school_id, verification_token_id)
      values (${teacher.id}, ${school!.id}, ${token!.id})
    `;
      const [room] = await client`
      insert into public.classes (school_id, teacher_user_id, name, join_code)
      values (${school!.id}, ${teacher.id}, 'TEST ONLY class', ${randomUUID()}) returning id
    `;
      await client`insert into public.class_memberships (class_id, student_user_id) values (${room!.id}, ${student.id})`;
      expect(await service.getProfile('student')).toMatchObject({ studentAffiliation: 'SCHOOL' });
      expect(await service.getProfile('teacher')).toMatchObject({ teacherVerified: true });
      await client`update public.schools set status='INACTIVE' where id=${school!.id}`;
      expect(await service.getProfile('teacher')).toMatchObject({ teacherVerified: false });
      expect(await service.getProfile('student')).toMatchObject({ studentAffiliation: 'SCHOOL' });
      await client`update public.schools set status='ACTIVE' where id=${school!.id}`;
      expect(await service.getProfile('teacher')).toMatchObject({ teacherVerified: true });
      await client`update public.class_memberships set left_at=clock_timestamp() where class_id=${room!.id} and student_user_id=${student.id}`;
      expect(await service.getProfile('student')).toMatchObject({ studentAffiliation: 'MANDIRI' });
      expect((await service.getProfile('admin')).capabilities).toEqual([]);
      await client`update public.users set admin_role='OPERATIONS' where id=${admin.id}`;
      expect((await service.getProfile('admin')).capabilities?.length).toBeGreaterThan(0);
      await client`update public.users set status='DISABLED' where id=${student.id}`;
      for (const read of [
        () => service.getProfile('student'),
        () => service.me('student', 'access'),
      ])
        await expect(read()).rejects.toMatchObject({ response: { code: 'ACCOUNT_DISABLED' } });
      await expect(service.me('missing', 'access')).rejects.toMatchObject({
        response: { code: 'ACCOUNT_NOT_REGISTERED' },
      });
    });
  },
);
