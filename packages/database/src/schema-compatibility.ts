import { is, Table } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Sql } from 'postgres';
import * as schema from './schema/index.js';

// Read metadata only; compatibility here covers table/column presence and RLS.
export async function inspectSchema(client: Sql) {
  return client.begin(async (tx) => {
    await tx.unsafe('SET TRANSACTION READ ONLY');
    const columns = await tx<{ table_schema: string; table_name: string; column_name: string }[]>`
      SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema IN ('public', 'irt_compute')`;
    const tables = await tx<{ schemaname: string; tablename: string; rowsecurity: boolean }[]>`
      SELECT schemaname, tablename, rowsecurity FROM pg_catalog.pg_tables WHERE schemaname IN ('public', 'irt_compute')`;
    const problems: string[] = [];
    let expectedTables = 0;
    for (const value of Object.values(schema)) {
      if (!is(value, Table)) continue;
      expectedTables++;
      const definition = getTableConfig(value);
      const namespace = definition.schema ?? 'public';
      const qualified = `${namespace}.${definition.name}`;
      const table = tables.find(
        (row) => row.schemaname === namespace && row.tablename === definition.name,
      );
      if (!table) {
        problems.push(`Missing table: ${qualified}`);
        continue;
      }
      if (!table.rowsecurity) problems.push(`RLS disabled: ${qualified}`);
      for (const column of definition.columns) {
        if (
          !columns.some(
            (row) =>
              row.table_schema === namespace &&
              row.table_name === definition.name &&
              row.column_name === column.name,
          )
        )
          problems.push(`Missing column: ${qualified}.${column.name}`);
      }
    }
    return { expectedTables, actualTables: tables.length, problems };
  });
}
