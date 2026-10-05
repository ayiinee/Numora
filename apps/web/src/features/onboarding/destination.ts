import type { IdentityProfile } from '@/lib/api';

export function destination(profile: Pick<IdentityProfile, 'role' | 'teacherVerified'>) {
  if (profile.role === 'STUDENT') return '/student';
  if (profile.role === 'ADMIN') return '/admin';
  return profile.teacherVerified ? '/teacher' : '/teacher/verification-required';
}
