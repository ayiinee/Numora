// Read-only: verifies the current PG reward policy without changing historical data.
import { getDatabase, closeDatabaseConnection } from '@tka/database';
const { client } = getDatabase();
try {
  const [report] = await client`
    WITH graded AS (
      SELECT ai.attempt_id,sum(aa.awarded_points/ai.max_points)*10 AS expected_xp
      FROM attempt_items ai JOIN attempt_answers aa ON aa.attempt_item_id=ai.id
      GROUP BY ai.attempt_id
    )
    SELECT (SELECT count(*)::integer FROM assessment_attempts a
      LEFT JOIN xp_ledger x ON x.attempt_id=a.id LEFT JOIN graded g ON g.attempt_id=a.id
      WHERE a.tryout_xp_policy_version=1 AND a.status='GRADED'
      AND (x.id IS NULL OR x.source_type IS DISTINCT FROM 'TRYOUT'
        OR x.policy_code IS DISTINCT FROM 'TRYOUT_PRD_V06' OR x.policy_version IS DISTINCT FROM 1
        OR g.expected_xp IS NULL OR x.xp_amount IS DISTINCT FROM g.expected_xp
        OR x.base_xp IS DISTINCT FROM x.xp_amount OR x.bonus_xp IS DISTINCT FROM 0::numeric
        OR x.occurred_at IS DISTINCT FROM a.finished_at)) AS reward_errors,
      (SELECT count(*)::integer FROM assessment_attempts
        WHERE assessment_type='TRYOUT' AND tryout_xp_policy_version IS NULL) AS legacy_attempts`;
  console.log(JSON.stringify({ mode: 'READ_ONLY', ...report }));
  if (report.reward_errors) process.exitCode = 1;
} finally { await closeDatabaseConnection(); }
