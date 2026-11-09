ALTER TABLE "assessment_attempts" ADD COLUMN "drill_timer" jsonb;
--> statement-breakpoint
UPDATE "assessment_attempts"
SET "drill_timer" = jsonb_build_object(
  'elapsedMs', greatest(0, floor(extract(epoch FROM (statement_timestamp() - "started_at")) * 1000)),
  'session', NULL
)
WHERE "assessment_type" = 'DRILL' AND "purpose" = 'REGULAR' AND "status" = 'IN_PROGRESS';
