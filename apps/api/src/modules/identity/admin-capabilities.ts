import { SetMetadata } from '@nestjs/common';

export const ADMIN_CAPABILITIES = [
  'ADMIN_ACCOUNTS_MANAGE',
  'OPERATIONS_MANAGE',
  'OPERATIONS_LIMITED_READ',
  'CONTENT_MANAGE',
  'ANALYTICS_OPERATIONS',
  'ANALYTICS_CONTENT',
  'AUDIT_READ',
] as const;
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];
export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'CONTENT_DATA_MODERATION';
const roles: Record<AdminRole, readonly AdminCapability[]> = {
  SUPER_ADMIN: ADMIN_CAPABILITIES,
  OPERATIONS: [
    'OPERATIONS_MANAGE',
    'OPERATIONS_LIMITED_READ',
    'ANALYTICS_OPERATIONS',
    'AUDIT_READ',
  ],
  CONTENT_DATA_MODERATION: [
    'CONTENT_MANAGE',
    'OPERATIONS_LIMITED_READ',
    'ANALYTICS_CONTENT',
    'AUDIT_READ',
  ],
};
export function adminCapabilities(role?: string | null): AdminCapability[] {
  return role && Object.hasOwn(roles, role) ? [...roles[role as AdminRole]] : [];
}
export const ADMIN_CAPABILITY_METADATA = 'numora:admin-capability';
export const RequireAdminCapability = (capability: AdminCapability) =>
  SetMetadata(ADMIN_CAPABILITY_METADATA, capability);
