import type { IdentityProfile } from '@/lib/api';

export type AdminWorkspacePermission = 'operations' | 'content';

// Presentation only; NestJS remains authoritative for each request.
export function adminCanAccess(
  profile: IdentityProfile | null,
  permission: AdminWorkspacePermission,
) {
  if (profile?.role !== 'ADMIN' || profile.status !== 'ACTIVE') return false;
  return permission === 'operations'
    ? profile.adminRole === 'SUPER_ADMIN' || profile.adminRole === 'OPERATIONS'
    : (profile.adminRole === 'SUPER_ADMIN' || profile.adminRole === 'CONTENT_DATA_MODERATION') &&
        Boolean(profile.capabilities?.includes('CONTENT_MANAGE'));
}
