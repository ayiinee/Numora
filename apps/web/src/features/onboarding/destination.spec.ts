import { describe, expect, it } from 'vitest';
import { destination } from './destination';

describe('role destination', () => {
  it('routes every Admin through the shared portal', () => {
    expect(destination({ role: 'ADMIN', teacherVerified: null })).toBe('/admin');
  });
  it('routes a Student to the Student area', () => {
    expect(destination({ role: 'STUDENT', teacherVerified: false })).toBe('/student');
  });
  it('routes a verified Teacher to the Teacher area', () => {
    expect(destination({ role: 'TEACHER', teacherVerified: true })).toBe('/teacher');
  });
  it('keeps an unverified Teacher on the verification status page', () => {
    expect(destination({ role: 'TEACHER', teacherVerified: false })).toBe(
      '/teacher/verification-required',
    );
  });
});
