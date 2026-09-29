import { uniqueIndex, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { subchapters } from './learning.js';

// PR #10 taxonomy extends the existing Drill hierarchy without redefining it.
export const competencies = pgTable('competencies', {
  id: uuid('id').defaultRandom().primaryKey(),
  subchapterId: uuid('subchapter_id').notNull().references(() => subchapters.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  description: text('description').notNull(),
}, (table) => [uniqueIndex('competencies_subchapter_code_uq').on(table.subchapterId, table.code)]).enableRLS();
