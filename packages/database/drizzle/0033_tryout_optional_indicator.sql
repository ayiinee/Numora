ALTER TABLE "questions" ALTER COLUMN "primary_competency_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_competency_required_ck" CHECK ("primary_competency_id" IS NOT NULL OR "usage_type" IS NOT DISTINCT FROM 'TRYOUT');
