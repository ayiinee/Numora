-- Browser access is limited to Supabase Auth. Domain data is served by NestJS.
-- Protect all 46 application tables created by migrations 0000 and 0001.
DO $lockdown$
DECLARE
  app_table text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'users', 'schools', 'teacher_verification_tokens', 'teacher_school_memberships',
    'classes', 'class_memberships', 'analytics_outbox', 'audit_logs',
    'chapters', 'subchapters', 'competencies', 'levels', 'questions',
    'question_variants', 'question_versions', 'scoring_policy_versions',
    'assessment_packages', 'package_items', 'assessment_attempts',
    'attempt_items', 'attempt_answers', 'level_progress',
    'leaderboard_periods', 'xp_ledger', 'class_leaderboard_entries',
    'pvp_matches', 'pvp_players', 'pvp_match_questions', 'pvp_answers',
    'pvp_invites', 'pvp_best_records', 'pvp_leaderboard_entries',
    'feedback', 'learning_videos', 'video_subchapter_mappings',
    'question_reports', 'video_reports', 'analytics_events',
    'account_restrictions', 'generator_configs', 'generation_runs',
    'generation_candidates', 'calibration_runs', 'variant_evaluations',
    'irt_batches', 'irt_item_results'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated, service_role', app_table);
  END LOOP;
END
$lockdown$;--> statement-breakpoint

-- Weekly leaderboard periods are half-open ranges and must not overlap.
ALTER TABLE public.leaderboard_periods
  ADD CONSTRAINT leaderboard_periods_no_overlap_excl
  EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&);
