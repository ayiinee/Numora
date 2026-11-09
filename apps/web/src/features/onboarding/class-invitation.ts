import type { IdentityProfile } from '@/lib/api';
import { destination } from './destination';

export const CLASS_JOIN_CODE = /^(?:[A-Za-z0-9]{6}|[A-Za-z0-9_-]{8,32})$/;
const storageKey = 'numora:class-invitation';

export function classJoinPath(code: string) {
  return CLASS_JOIN_CODE.test(code) ? `/student/join?code=${encodeURIComponent(code)}` : null;
}

export function rememberClassInvitation() {
  if (typeof window === 'undefined' || window.location.pathname !== '/student/join') return;
  const code = new URLSearchParams(window.location.search).get('code')?.trim() ?? '';
  try {
    if (classJoinPath(code)) window.sessionStorage.setItem(storageKey, code);
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // Storage may be unavailable. Manual class-code entry remains available.
  }
}

export function clearClassInvitation() {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Navigation and membership never depend on browser storage succeeding.
  }
}

export function postLoginDestination(profile: Pick<IdentityProfile, 'role' | 'teacherVerified'>) {
  if (profile.role !== 'STUDENT') {
    clearClassInvitation();
    return destination(profile);
  }
  try {
    return classJoinPath(window.sessionStorage.getItem(storageKey) ?? '') ?? destination(profile);
  } catch {
    return destination(profile);
  }
}
