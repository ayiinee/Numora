import { SetMetadata } from '@nestjs/common';

export const ADMIN_PERMISSION = 'numora.adminPermission';
export type AdminSubRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION';
export type AdminPermission = 'operations' | 'content' | 'dashboard' | 'audit' | 'adminAccounts';
export const AdminAccess = (permission: AdminPermission) =>
  SetMetadata(ADMIN_PERMISSION, permission);

// No Admin role grants class ban/unban. Those actions belong to the active Teacher.
export function adminAllows(role: AdminSubRole | null | undefined, permission: AdminPermission) {
  return (
    role === 'SUPER_ADMIN' ||
    (permission === 'dashboard' && (role === 'OPERATIONS' || role === 'CONTENT_DATA_MODERATION')) ||
    (role === 'OPERATIONS' && permission === 'operations') ||
    (role === 'CONTENT_DATA_MODERATION' && permission === 'content')
  );
}
