import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { allowSyntheticContent } from './package-runtime.js';
import {
  gaugeRuntime,
  instrumentSql,
  metricsEnabled,
  runtimeInstanceId,
  runtimeNamespace,
  runtimeService,
} from './runtime-metrics.js';

type DatabaseConnection = {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle>;
};

let connection: DatabaseConnection | undefined;

export function requireTlsDatabaseUrl(url: string) {
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get('sslmode');
  if (
    process.env.NODE_ENV === 'test' &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname) &&
    sslMode === 'disable'
  )
    return url;
  if (sslMode !== 'require' && sslMode !== 'verify-full') {
    throw new Error('PostgreSQL URL must set sslmode=require or sslmode=verify-full.');
  }
  return url;
}

export function getDatabase(): DatabaseConnection {
  allowSyntheticContent();
  if (connection) return connection;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const client = instrumentSql(
    postgres(requireTlsDatabaseUrl(databaseUrl), {
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idle_timeout: 20,
      ...(metricsEnabled()
        ? {
            connection: {
              application_name: `numora:${runtimeNamespace()}:${runtimeService()}:${runtimeInstanceId.slice(0, 8)}`,
            },
          }
        : {}),
    }),
  );
  gaugeRuntime('numora_db_pool_max', Number(process.env.DB_POOL_MAX ?? 10));

  connection = {
    client,
    // Runtime callers use the SQL query builder. Omitting the relational schema
    // avoids rebuilding unused relational query objects for every transaction.
    db: drizzle(client),
  };

  return connection;
}

export async function checkDatabaseConnection() {
  const { client } = getDatabase();
  const result = await client<{ ok: number }[]>`select 1 as ok`;
  if (result[0]?.ok !== 1) throw new Error('Database health check failed.');
}

export async function closeDatabaseConnection() {
  if (!connection) return;
  await connection.client.end();
  connection = undefined;
}
