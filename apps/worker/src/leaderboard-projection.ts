import { getDatabase, type leaderboardPeriods } from '@tka/database';
import { sql } from 'drizzle-orm';
type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>['db']['transaction']>[0]>[0];
type Period = typeof leaderboardPeriods.$inferSelect;

/** SQL remains inside the caller's advisory-locked projection/archive transaction. */
export async function projectLeaderboardRows(
  tx: Tx,
  period: Period,
  membershipAt: Date,
  archived: boolean,
  now: Date,
) {
  const [classes] = await tx.execute<{ total: number; written: number; removed: number }>(sql`
    WITH totals AS MATERIALIZED (
      SELECT cm.class_id,cm.student_user_id AS student_id,coalesce(sum(x.xp_amount),0) AS total_xp
      FROM class_memberships cm JOIN classes c ON c.id=cm.class_id JOIN users u ON u.id=cm.student_user_id
      LEFT JOIN xp_ledger x ON x.student_id=cm.student_user_id AND x.source_type IN ('DRILL','TRYOUT')
        AND x.occurred_at>=${period.startsAt.toISOString()}::timestamptz AND x.occurred_at<${period.endsAt.toISOString()}::timestamptz
      WHERE cm.joined_at<${membershipAt.toISOString()}::timestamptz
        AND (cm.left_at IS NULL OR (${archived}::boolean AND cm.left_at>=${membershipAt.toISOString()}::timestamptz))
        AND (c.archived_at IS NULL OR (${archived}::boolean AND c.archived_at>=${membershipAt.toISOString()}::timestamptz))
        AND u.status='ACTIVE'
      GROUP BY cm.class_id,cm.student_user_id
    ), ranked AS MATERIALIZED (
      SELECT *,dense_rank() OVER(PARTITION BY class_id ORDER BY total_xp DESC)::integer AS rank FROM totals
    ), removed AS (
      DELETE FROM class_leaderboard_entries e WHERE e.period_id=${period.id}::uuid
        AND NOT EXISTS(SELECT 1 FROM ranked r WHERE r.class_id=e.class_id AND r.student_id=e.student_id) RETURNING 1
    ), written AS (
      INSERT INTO class_leaderboard_entries AS e(period_id,class_id,student_id,total_xp,rank,updated_at)
      SELECT ${period.id}::uuid,class_id,student_id,total_xp,rank,${now.toISOString()}::timestamptz FROM ranked
      ON CONFLICT(period_id,class_id,student_id) DO UPDATE SET total_xp=excluded.total_xp,rank=excluded.rank,updated_at=excluded.updated_at
      WHERE (e.total_xp,e.rank) IS DISTINCT FROM (excluded.total_xp,excluded.rank) RETURNING 1
    ) SELECT (SELECT count(*)::integer FROM ranked) AS total,(SELECT count(*)::integer FROM written) AS written,(SELECT count(*)::integer FROM removed) AS removed
  `);
  const [global] = await tx.execute<{ total: number; written: number; removed: number }>(sql`
    WITH totals AS MATERIALIZED (
      SELECT u.id AS student_id,coalesce(sum(x.xp_amount),0) AS total_xp FROM users u
      LEFT JOIN xp_ledger x ON x.student_id=u.id AND x.source_type IN ('DRILL','TRYOUT')
        AND x.occurred_at>=${period.startsAt.toISOString()}::timestamptz AND x.occurred_at<${period.endsAt.toISOString()}::timestamptz
      WHERE u.role='STUDENT' AND u.status='ACTIVE' AND u.created_at<${membershipAt.toISOString()}::timestamptz GROUP BY u.id
    ), ranked AS MATERIALIZED (
      SELECT *,dense_rank() OVER(ORDER BY total_xp DESC)::integer AS rank FROM totals
    ), removed AS (
      DELETE FROM global_activity_leaderboard_entries e WHERE e.period_id=${period.id}::uuid
        AND NOT EXISTS(SELECT 1 FROM ranked r WHERE r.student_id=e.student_id) RETURNING 1
    ), written AS (
      INSERT INTO global_activity_leaderboard_entries AS e(period_id,student_id,total_xp,rank,updated_at)
      SELECT ${period.id}::uuid,student_id,total_xp,rank,${now.toISOString()}::timestamptz FROM ranked
      ON CONFLICT(period_id,student_id) DO UPDATE SET total_xp=excluded.total_xp,rank=excluded.rank,updated_at=excluded.updated_at
      WHERE (e.total_xp,e.rank) IS DISTINCT FROM (excluded.total_xp,excluded.rank) RETURNING 1
    ) SELECT (SELECT count(*)::integer FROM ranked) AS total,(SELECT count(*)::integer FROM written) AS written,(SELECT count(*)::integer FROM removed) AS removed
  `);
  const [pvp] = await tx.execute<{ total: number; written: number; removed: number }>(sql`
    WITH candidates AS MATERIALIZED (
      SELECT p.student_id,m.difficulty,m.data_mode,m.id AS match_id,p.total_points AS best_points,m.ended_at AS achieved_at,
        row_number() OVER(PARTITION BY p.student_id,m.difficulty,m.data_mode ORDER BY p.total_points DESC,date_trunc('milliseconds',m.ended_at),m.id) AS preference
      FROM pvp_players p JOIN pvp_matches m ON m.id=p.match_id
      WHERE m.status='FINISHED' AND m.record_eligible AND m.end_reason='COMPLETED' AND p.left_at IS NULL
        AND m.ended_at>=${period.startsAt.toISOString()}::timestamptz AND m.ended_at<${period.endsAt.toISOString()}::timestamptz
    ), best AS MATERIALIZED (SELECT * FROM candidates WHERE preference=1), ranked AS MATERIALIZED (
      SELECT *,dense_rank() OVER(PARTITION BY difficulty,data_mode ORDER BY best_points DESC)::integer AS rank FROM best
    ), removed_best AS (
      DELETE FROM pvp_best_records e WHERE e.period_id=${period.id}::uuid AND NOT EXISTS(
        SELECT 1 FROM best r WHERE (r.student_id,r.difficulty,r.data_mode)=(e.student_id,e.difficulty,e.data_mode)) RETURNING 1
    ), written_best AS (
      INSERT INTO pvp_best_records AS e(period_id,student_id,difficulty,data_mode,match_id,best_points,achieved_at)
      SELECT ${period.id}::uuid,student_id,difficulty,data_mode,match_id,best_points,achieved_at FROM best
      ON CONFLICT(period_id,student_id,difficulty,data_mode) DO UPDATE SET match_id=excluded.match_id,best_points=excluded.best_points,achieved_at=excluded.achieved_at
      WHERE (e.match_id,e.best_points,e.achieved_at) IS DISTINCT FROM (excluded.match_id,excluded.best_points,excluded.achieved_at) RETURNING 1
    ), removed AS (
      DELETE FROM pvp_leaderboard_entries e WHERE e.period_id=${period.id}::uuid AND NOT EXISTS(
        SELECT 1 FROM ranked r WHERE (r.student_id,r.difficulty,r.data_mode)=(e.student_id,e.difficulty,e.data_mode)) RETURNING 1
    ), written AS (
      INSERT INTO pvp_leaderboard_entries AS e(period_id,student_id,difficulty,data_mode,best_points,rank,updated_at)
      SELECT ${period.id}::uuid,student_id,difficulty,data_mode,best_points,rank,${now.toISOString()}::timestamptz FROM ranked
      ON CONFLICT(period_id,student_id,difficulty,data_mode) DO UPDATE SET best_points=excluded.best_points,rank=excluded.rank,updated_at=excluded.updated_at
      WHERE (e.best_points,e.rank) IS DISTINCT FROM (excluded.best_points,excluded.rank) RETURNING 1
    ) SELECT (SELECT count(*)::integer FROM ranked) AS total,
      ((SELECT count(*) FROM written)+(SELECT count(*) FROM written_best))::integer AS written,
      ((SELECT count(*) FROM removed)+(SELECT count(*) FROM removed_best))::integer AS removed
  `);
  return {
    entries: classes!.total,
    pvpEntries: pvp!.total,
    written: classes!.written + global!.written + pvp!.written,
    removed: classes!.removed + global!.removed + pvp!.removed,
  };
}
