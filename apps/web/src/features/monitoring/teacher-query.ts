import { ApiProblem } from '@/lib/api';

/**
 * Single source for the Teacher query cache keys. The same literals were repeated in
 * four modules, so a screen could invalidate a key another screen no longer reads.
 */
export const teacherKeys = {
  classes: () => ['teacher-classes'] as const,
  roster: (classId: string) => ['class-students', classId] as const,
  progress: (classId: string, studentId: string) =>
    ['student-progress', classId, studentId] as const,
  feedback: (classId: string, studentId: string) =>
    ['teacher-feedback', classId, studentId] as const,
  assessments: (classId: string, studentId: string) =>
    ['teacher-assessments', classId, studentId] as const,
};

/**
 * 401/403/404 mean this Teacher may not see this student at all, which is different from
 * a query that simply failed. Callers hide the workspace instead of offering a retry that
 * cannot succeed.
 */
export function teacherAccessFailure(...failures: unknown[]): ApiProblem | undefined {
  return failures.find(
    (failure): failure is ApiProblem =>
      failure instanceof ApiProblem && [401, 403, 404].includes(failure.status),
  );
}

/** Business time is shown in Asia/Jakarta while durable timestamps stay UTC. */
export const jakartaTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'medium',
  timeStyle: 'short',
});
