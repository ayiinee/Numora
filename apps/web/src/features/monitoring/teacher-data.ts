'use client';

import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiProblem,
  getClassStudents,
  getTeacherClasses,
  getTeacherStudentProgress,
} from '@/lib/api';
import type { ClassSummary, TeacherStudentProgress } from '@/lib/api';

export function useTeacherRosterCounts(token: string, classes: ClassSummary[] | undefined) {
  const queries = useQueries({
    queries: (classes ?? []).map((value) => ({
      queryKey: ['class-students', value.id],
      queryFn: () => getClassStudents(token, value.id),
      staleTime: 30_000,
    })),
  });
  const complete = classes !== undefined && queries.every((query) => query.isSuccess);
  return {
    queries,
    complete,
    total: complete ? queries.reduce((sum, query) => sum + query.data!.items.length, 0) : undefined,
    error: queries.find((query) => query.isError)?.error,
    retry: () => queries.forEach((query) => void query.refetch()),
  };
}

export function useTeacherClassContext(token: string, initialClassId = '') {
  const [selection, setSelection] = useState(initialClassId);
  const classes = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => getTeacherClasses(token),
  });
  const classId = selection || classes.data?.items[0]?.id || '';
  const selectedClass = classes.data?.items.find((value) => value.id === classId);
  const invalid = Boolean(classes.data && classId && !selectedClass);
  const roster = useQuery({
    queryKey: ['class-students', classId],
    queryFn: () => getClassStudents(token, classId),
    enabled: Boolean(selectedClass),
  });
  return {
    classes,
    classId,
    selectedClass,
    roster,
    setSelection,
    invalidError: invalid
      ? new ApiProblem(404, 'CLASS_NOT_FOUND', 'Kelas tidak tersedia dalam akun Anda.')
      : null,
  };
}

// Bounded requests reuse each student's existing query and API ownership checks.
// An incomplete batch is an error, never an apparently complete aggregate.
export function useTeacherClassProgress(
  token: string,
  classId: string,
  studentIds: string[] | undefined,
) {
  const cache = useQueryClient();
  return useQuery({
    queryKey: ['teacher-class-progress', classId, studentIds],
    enabled: studentIds !== undefined,
    queryFn: async () => {
      const results: TeacherStudentProgress[] = [];
      let cursor = 0;
      const workers = Array.from({ length: Math.min(6, studentIds!.length) }, async () => {
        while (cursor < studentIds!.length) {
          const index = cursor++;
          const studentId = studentIds![index]!;
          results[index] = await cache.fetchQuery({
            queryKey: ['student-progress', classId, studentId],
            queryFn: () => getTeacherStudentProgress(token, classId, studentId),
            staleTime: 30_000,
          });
        }
      });
      await Promise.allSettled(workers).then((outcomes) => {
        const failed = outcomes.find((outcome) => outcome.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      });
      return results;
    },
  });
}
