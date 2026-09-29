import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['STUDENT', 'TEACHER', 'ADMIN']);
export const accountStatus = pgEnum('account_status', ['ACTIVE', 'DISABLED']);
export const schoolStatus = pgEnum('school_status', ['ACTIVE', 'INACTIVE']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authUserId: uuid('auth_user_id').notNull(),
    role: userRole('role').notNull(),
    displayName: text('display_name').notNull(),
    email: text('email').notNull(),
    status: accountStatus('status').notNull().default('ACTIVE'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_auth_user_id_uq').on(table.authUserId),
    uniqueIndex('users_email_uq').on(table.email),
  ],
);

export const schools = pgTable(
  'schools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    status: schoolStatus('status').notNull().default('ACTIVE'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('schools_code_uq').on(table.code),
    check('schools_code_nonempty_ck', sql`length(trim(${table.code})) > 0`),
    check('schools_name_nonempty_ck', sql`length(trim(${table.name})) > 0`),
  ],
);

export const teacherVerificationTokens = pgTable(
  'teacher_verification_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: uuid('used_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('teacher_verification_tokens_hash_uq').on(table.tokenHash),
    uniqueIndex('teacher_verification_tokens_id_school_uq').on(table.id, table.schoolId),
    index('teacher_verification_tokens_school_idx').on(table.schoolId),
    check(
      'teacher_verification_tokens_expiry_ck',
      sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + interval '72 hours'`,
    ),
    check('teacher_verification_tokens_used_time_ck', sql`${table.usedAt} is null or (${table.usedAt} >= ${table.createdAt} and ${table.usedAt} <= ${table.expiresAt})`),
    check('teacher_verification_tokens_revoked_time_ck', sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`),
    check(
      'teacher_verification_tokens_usage_ck',
      sql`(${table.usedAt} is null) = (${table.usedByUserId} is null)`,
    ),
  ],
);

export const teacherSchoolMemberships = pgTable(
  'teacher_school_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teacherUserId: uuid('teacher_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    verificationTokenId: uuid('verification_token_id')
      .notNull()
      .references(() => teacherVerificationTokens.id, { onDelete: 'restrict' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('teacher_school_memberships_token_uq').on(table.verificationTokenId),
    uniqueIndex('teacher_school_memberships_active_teacher_school_uq')
      .on(table.teacherUserId, table.schoolId)
      .where(sql`${table.endedAt} is null`),
    index('teacher_school_memberships_school_idx').on(table.schoolId),
    foreignKey({
      name: 'teacher_school_memberships_token_school_fk',
      columns: [table.verificationTokenId, table.schoolId],
      foreignColumns: [teacherVerificationTokens.id, teacherVerificationTokens.schoolId],
    }).onDelete('restrict'),
    check(
      'teacher_school_memberships_ended_at_ck',
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.verifiedAt}`,
    ),
  ],
);
