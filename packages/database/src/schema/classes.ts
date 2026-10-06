import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { schools, users } from './identity.js';

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'restrict' }),
    teacherUserId: uuid('teacher_user_id').references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    joinCode: text('join_code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('classes_join_code_uq').on(table.joinCode),
    index('classes_teacher_idx').on(table.teacherUserId),
    index('classes_school_idx').on(table.schoolId),
    check('classes_name_nonempty_ck', sql`length(trim(${table.name})) > 0`),
    check('classes_join_code_nonempty_ck', sql`length(trim(${table.joinCode})) > 0`),
    check(
      'classes_archived_at_ck',
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
).enableRLS();

export const classMemberships = pgTable(
  'class_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    studentUserId: uuid('student_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    endReason: text('end_reason'),
  },
  (table) => [
    uniqueIndex('class_memberships_active_student_class_uq')
      .on(table.studentUserId, table.classId)
      .where(sql`${table.leftAt} is null`),
    index('class_memberships_active_student_idx')
      .on(table.studentUserId)
      .where(sql`${table.leftAt} is null`),
    index('class_memberships_class_idx').on(table.classId),
    check(
      'class_memberships_left_at_ck',
      sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`,
    ),
    check(
      'class_memberships_end_reason_ck',
      sql`${table.endReason} is null or (${table.leftAt} is not null and ${table.endReason} in ('LEFT', 'BANNED'))`,
    ),
  ],
).enableRLS();

// Unban ends a restriction; it never silently restores membership.
export const classStudentBans = pgTable(
  'class_student_bans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'restrict' }),
    studentUserId: uuid('student_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    bannedByUserId: uuid('banned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    bannedAt: timestamp('banned_at', { withTimezone: true }).notNull().defaultNow(),
    unbannedByUserId: uuid('unbanned_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    unbannedAt: timestamp('unbanned_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('class_student_bans_active_uq')
      .on(table.classId, table.studentUserId)
      .where(sql`${table.unbannedAt} is null`),
    index('class_student_bans_student_idx').on(table.studentUserId, table.classId),
    check(
      'class_student_bans_unban_ck',
      sql`(${table.unbannedAt} is null and ${table.unbannedByUserId} is null) or (${table.unbannedAt} is not null and ${table.unbannedAt} >= ${table.bannedAt} and ${table.unbannedByUserId} is not null)`,
    ),
  ],
).enableRLS();
