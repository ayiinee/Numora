import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, uuid } from 'drizzle-orm/pg-core';

export const pvpContentRevision = pgTable(
  'pvp_content_revision',
  {
    singleton: boolean('singleton').primaryKey().default(true),
    revision: uuid('revision').notNull().defaultRandom(),
  },
  (table) => [check('pvp_content_revision_singleton', sql`${table.singleton} = true`)],
);
