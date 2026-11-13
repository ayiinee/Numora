import { afterEach, expect, it } from 'vitest';
import { readTryoutResume, tryoutResumeKey, writeTryoutResume } from './tryout-resume';

afterEach(() => localStorage.clear());

it('restores only session question IDs for the same student and active attempt', () => {
  const key = tryoutResumeKey('student-1', 'attempt-1');
  writeTryoutResume(key, { questionId: 'q2', flagged: ['q1', 'other-question'] });
  expect(readTryoutResume(key, ['q1', 'q2'], false)).toEqual({ questionId: 'q2', flagged: ['q1'] });
  expect(readTryoutResume(key, ['q1', 'q2'], true)).toBeUndefined();
  expect(readTryoutResume(key, ['q1'], false)).toBeUndefined();
  expect(
    readTryoutResume(tryoutResumeKey('student-2', 'attempt-1'), ['q1', 'q2'], false),
  ).toBeUndefined();
  expect(
    readTryoutResume(tryoutResumeKey('student-1', 'attempt-2'), ['q1', 'q2'], false),
  ).toBeUndefined();
  writeTryoutResume(key);
  expect(localStorage.getItem(key)).toBeNull();
});

it('ignores corrupt browser data', () => {
  const key = tryoutResumeKey('student-1', 'attempt-1');
  localStorage.setItem(key, '{');
  expect(readTryoutResume(key, ['q1'], false)).toBeUndefined();
});
