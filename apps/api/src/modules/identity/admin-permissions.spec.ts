import { describe, expect, it } from 'vitest';
import { adminAllows } from './admin-permissions';

describe('PRD v0.6 Admin permissions', () => {
  it('denies unassigned legacy Admins and separates operations from content', () => {
    expect(adminAllows(null, 'content')).toBe(false);
    expect(adminAllows(undefined, 'adminAccounts')).toBe(false);
    expect(adminAllows('OPERATIONS', 'operations')).toBe(true);
    expect(adminAllows('OPERATIONS', 'content')).toBe(false);
    expect(adminAllows('CONTENT_DATA_MODERATION', 'content')).toBe(true);
    expect(adminAllows('CONTENT_DATA_MODERATION', 'operations')).toBe(false);
    expect(adminAllows('CONTENT_DATA_MODERATION', 'adminAccounts')).toBe(false);
    expect(adminAllows('CONTENT_DATA_MODERATION', 'schoolRead')).toBe(true);
    expect(adminAllows('OPERATIONS', 'schoolRead')).toBe(true);
    expect(adminAllows(null, 'schoolRead')).toBe(false);
  });
  it('only Super Admin can access unrestricted audit/admin account management', () => {
    expect(adminAllows('OPERATIONS', 'audit')).toBe(false);
    expect(adminAllows('CONTENT_DATA_MODERATION', 'audit')).toBe(false);
    expect(adminAllows('SUPER_ADMIN', 'audit')).toBe(true);
    expect(adminAllows('SUPER_ADMIN', 'adminAccounts')).toBe(true);
  });
});
