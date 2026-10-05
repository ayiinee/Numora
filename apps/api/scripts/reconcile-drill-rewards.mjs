// Read-only consistency check. Never backfills legacy rewards or rewrites history.
import { getDatabase, closeDatabaseConnection } from '@tka/database';
const { client } = getDatabase();
try {
  const [report] = await client`
    WITH latest AS (
      SELECT DISTINCT ON(student_id,level_id_at_start) student_id,level_id_at_start,stars,score_0_100,drill_policy_version
      FROM assessment_attempts WHERE assessment_type='DRILL' AND purpose='REGULAR' AND status='GRADED'
      ORDER BY student_id,level_id_at_start,finished_at DESC,id DESC
    )
    SELECT
      (SELECT count(*)::integer FROM assessment_attempts a LEFT JOIN xp_ledger x ON x.attempt_id=a.id
       WHERE a.drill_policy_version=2 AND a.status='GRADED' AND a.purpose='REGULAR'
       AND (x.id IS NULL OR x.policy_version IS DISTINCT FROM 2 OR x.policy_code IS DISTINCT FROM 'DRILL_PRD_V06'
         OR x.source_type<>'DRILL' OR x.base_xp IS DISTINCT FROM (a.raw_points*10)::integer
         OR x.xp_amount IS DISTINCT FROM round(least(150,x.base_xp+x.bonus_xp))::integer)) AS reward_errors,
      (SELECT count(*)::integer FROM latest a LEFT JOIN level_progress p ON p.student_id=a.student_id AND p.level_id=a.level_id_at_start
       WHERE a.drill_policy_version=2 AND (p.id IS NULL OR p.latest_score IS DISTINCT FROM a.score_0_100 OR p.latest_stars IS DISTINCT FROM a.stars
         OR p.best_score IS NULL OR p.best_score<a.score_0_100)) AS progress_errors,
      (SELECT count(*)::integer FROM assessment_attempts WHERE assessment_type='DRILL' AND drill_policy_version IS NULL) AS legacy_attempts`;
  console.log(JSON.stringify({ mode: 'READ_ONLY', ...report }));
  if (report.reward_errors || report.progress_errors) process.exitCode = 1;
} finally {
  await closeDatabaseConnection();
}
