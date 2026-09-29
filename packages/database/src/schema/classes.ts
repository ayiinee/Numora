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
    teacherUserId: uuid('teacher_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
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
    check('classes_archived_at_ck', sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`),
  ],
);

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
  },
  (table) => [
    uniqueIndex('class_memberships_active_student_uq')
      .on(table.studentUserId)
      .where(sql`${table.leftAt} is null`),
    index('class_memberships_class_idx').on(table.classId),
    check('class_memberships_left_at_ck', sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`),
  ],
);
