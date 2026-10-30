import { describe, expect, it } from 'vitest';
import {
  ROLE_REQUIRED_MESSAGE,
  isRegisterableRole,
  type RegisterableRole,
} from './role-validation';

describe('registerable role validation', () => {
  it('accepts only Student and Teacher roles', () => {
    const valid: unknown[] = ['STUDENT', 'TEACHER'];
    const invalid: unknown[] = ['', null, undefined, 'ADMIN', 'student', 1, {}];

    expect(valid.every(isRegisterableRole)).toBe(true);
    expect(invalid.some(isRegisterableRole)).toBe(false);
  });

  it('keeps the role type limited to registration roles', () => {
    const role: RegisterableRole = 'STUDENT';
    expect(role).toBe('STUDENT');
  });

  it('provides a clear required-field message', () => {
    expect(ROLE_REQUIRED_MESSAGE).toBe('Pilih salah satu role: Siswa atau Guru.');
  });
});
