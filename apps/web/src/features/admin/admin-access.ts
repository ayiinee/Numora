import type { IdentityProfile } from '@/lib/api';

export type AdminWorkspacePermission = 'operations' | 'content' | 'accounts';

export function adminCanReadAnalytics(profile: IdentityProfile | null) {
  return (
    profile?.role === 'ADMIN' &&
    profile.status === 'ACTIVE' &&
    profile.adminRole === 'SUPER_ADMIN' &&
    Boolean(
      profile.capabilities?.some(
        (capability) => capability === 'ANALYTICS_CONTENT' || capability === 'ANALYTICS_OPERATIONS',
      ),
    )
  );
}

// Presentation only; NestJS remains authoritative for each request.
export function adminCanAccess(
  profile: IdentityProfile | null,
  permission: AdminWorkspacePermission,
) {
  if (profile?.role !== 'ADMIN' || profile.status !== 'ACTIVE') return false;
  if (permission === 'accounts')
    return (
      profile.adminRole === 'SUPER_ADMIN' &&
      Boolean(profile.capabilities?.includes('ADMIN_ACCOUNTS_MANAGE'))
    );
  return permission === 'operations'
    ? profile.adminRole === 'SUPER_ADMIN' || profile.adminRole === 'OPERATIONS'
    : (profile.adminRole === 'SUPER_ADMIN' || profile.adminRole === 'CONTENT_DATA_MODERATION') &&
        Boolean(profile.capabilities?.includes('CONTENT_MANAGE'));
}
