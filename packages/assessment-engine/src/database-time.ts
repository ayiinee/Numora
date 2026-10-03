import { getDatabase } from '@tka/database';
import { sql } from 'drizzle-orm';

type Transaction = Parameters<Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]>[0];

export async function databaseTime(tx: Pick<Transaction, 'execute'>): Promise<Date> {
  // Unlike transaction_timestamp(), this advances while a request waits for a row lock.
  const [clock] = await tx.execute<{ value: string }>(sql`select clock_timestamp()::text as value`);
  if (!clock) throw new Error('DATABASE_CLOCK_UNAVAILABLE');
  return new Date(clock.value);
}

