import { sql } from 'drizzle-orm';
import type { getDatabase } from './client.js';

export type TryoutIssue = {
  code: string;
  questionNumber: number | null;
  field: string;
  message: string;
};
export async function tryoutTechnicalIssues(
  reader: Pick<ReturnType<typeof getDatabase>['db'], 'execute'>,
  packageId: string,
): Promise<TryoutIssue[]> {
  const rows = await reader.execute<{
    code: string;
    question_number: number | null;
    field: string;
    message: string;
  }>(sql`select * from public.tryout_package_issues(${packageId}::uuid)`);
  return rows.map((r) => ({
    code: r.code,
    questionNumber: r.question_number,
    field: r.field,
    message: r.message,
  }));
}
