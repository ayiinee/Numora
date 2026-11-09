import { beforeEach, expect, it } from 'vitest';
import {
  classJoinPath,
  rememberClassInvitation,
  postLoginDestination,
  clearClassInvitation,
} from './class-invitation';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('retains only a validated class code across login and registration until confirmation', () => {
  window.history.replaceState(null, '', '/student/join?code=Ab_cd-234&next=https://evil.example');
  rememberClassInvitation();
  window.history.replaceState(null, '', '/auth/callback?code=fixture');
  expect(postLoginDestination({ role: 'STUDENT', teacherVerified: null })).toBe(
    '/student/join?code=Ab_cd-234',
  );
  clearClassInvitation();
  expect(postLoginDestination({ role: 'STUDENT', teacherVerified: null })).toBe('/student');
});

it('rejects malicious codes and does not redirect another role into Student membership', () => {
  for (const code of [
    'https://evil.example',
    'javascript:alert(1)',
    '//evil.example',
    'bad',
    'QA1234&next=evil',
  ])
    expect(classJoinPath(code)).toBeNull();
  window.history.replaceState(null, '', '/student/join?code=QA1234');
  rememberClassInvitation();
  expect(postLoginDestination({ role: 'TEACHER', teacherVerified: true })).toBe('/teacher');
  expect(postLoginDestination({ role: 'STUDENT', teacherVerified: null })).toBe('/student');
});
