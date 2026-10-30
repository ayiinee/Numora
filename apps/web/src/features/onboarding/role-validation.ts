export const REGISTERABLE_ROLES = ['STUDENT', 'TEACHER'] as const;

export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number];

export const ROLE_REQUIRED_MESSAGE = 'Pilih salah satu role: Siswa atau Guru.';

export function isRegisterableRole(value: unknown): value is RegisterableRole {
  return (
    typeof value === 'string' &&
    (REGISTERABLE_ROLES as readonly string[]).includes(value)
  );
}
