-- Custom SQL migration file, put your code below! --
-- Owner-approved 7 October 2026. New pin only; existing packages/results unchanged.
INSERT INTO public.scoring_policy_versions(policy_code,version,configuration,status)
VALUES ('TRYOUT_PGK_PARTIAL_V1',1,
 '{"prdVersion":"0.6","questionCount":30,"rubric":"OPTIONS_STATEMENTS_PARTIAL_V1","mcma":"correct_option_decisions/option_count","category":"correct_statements/statement_count","unanswered":0,"awardedPointsDecimals":2,"equivalentCorrectXpMultiplier":10,"approvedBy":"PROJECT_OWNER","approvedDate":"2026-10-07"}'::jsonb,
 'PUBLISHED') ON CONFLICT (policy_code,version) DO NOTHING;
