import { sql, type GetColumnData } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/** Compile schema-owned identifiers once; values remain query parameters. */
export function pvpReadProjection<T extends Record<string, PgColumn>>(
  columns: T,
  alias: string,
  prefix: string,
) {
  if (![alias, prefix].every((value) => /^[a-z_]+$/.test(value)))
    throw new Error('Invalid internal projection identifier.');
  const entries = Object.entries(columns);
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  return {
    selection: sql.raw(
      entries
        .map(([key, column]) => `${quote(alias)}.${quote(column.name)} as ${quote(prefix + key)}`)
        .join(', '),
    ),
    decode(row: Record<string, unknown>) {
      return Object.fromEntries(
        entries.map(([key, column]) => {
          const value = row[prefix + key];
          return [key, value == null ? value : column.mapFromDriverValue(value)];
        }),
      ) as { [K in keyof T]: GetColumnData<T[K], 'query'> };
    },
  };
}
