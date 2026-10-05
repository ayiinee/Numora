CREATE TYPE "public"."admin_role" AS ENUM('SUPER_ADMIN', 'OPERATIONS', 'CONTENT_DATA_MODERATION');--> statement-breakpoint
CREATE TABLE "content_import_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_namespace" text NOT NULL,
	"external_id" text NOT NULL,
	"question_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_import_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_import_versions" (
	"question_version_id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_import_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"source_namespace" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_preview_answers" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"answer" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_preview_answer_revision_ck" CHECK ("content_preview_answers"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "content_preview_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_preview_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "content_preview_position_ck" CHECK ("content_preview_items"."position">0)
);
--> statement-breakpoint
ALTER TABLE "content_preview_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_preview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"state" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"submit_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "content_preview_state_ck" CHECK (("content_preview_sessions"."state"='IN_PROGRESS' and "content_preview_sessions"."submitted_at" is null and "content_preview_sessions"."submit_key" is null) or ("content_preview_sessions"."state"='SUBMITTED' and "content_preview_sessions"."submitted_at" is not null and "content_preview_sessions"."submit_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "content_preview_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "question_versions" ALTER COLUMN "difficulty" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_role" "admin_role";--> statement-breakpoint
ALTER TABLE "content_import_identities" ADD CONSTRAINT "content_import_identities_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_import_versions" ADD CONSTRAINT "content_import_versions_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_import_versions" ADD CONSTRAINT "content_import_versions_identity_id_content_import_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."content_import_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_import_versions" ADD CONSTRAINT "content_import_versions_import_id_content_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."content_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_imports" ADD CONSTRAINT "content_imports_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_preview_answers" ADD CONSTRAINT "content_preview_answers_item_id_content_preview_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_preview_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_preview_items" ADD CONSTRAINT "content_preview_items_session_id_content_preview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."content_preview_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_preview_items" ADD CONSTRAINT "content_preview_items_question_version_id_question_versions_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_preview_sessions" ADD CONSTRAINT "content_preview_sessions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_import_identities_source_uq" ON "content_import_identities" USING btree ("source_namespace","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_import_identities_question_uq" ON "content_import_identities" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_imports_operation_uq" ON "content_imports" USING btree ("actor_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_preview_item_position_uq" ON "content_preview_items" USING btree ("session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "content_preview_operation_uq" ON "content_preview_sessions" USING btree ("actor_user_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_role_ck" CHECK ("users"."admin_role" is null or "users"."role" = 'ADMIN');
--> statement-breakpoint
DO $$ DECLARE relation text; api_role text; BEGIN
 FOREACH relation IN ARRAY ARRAY['content_imports','content_import_identities','content_import_versions','content_preview_sessions','content_preview_items','content_preview_answers'] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',relation);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role','numora_irt_runtime'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN EXECUTE format('REVOKE ALL ON public.%I FROM %I',relation,api_role); END IF;
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO numora_main_runtime',relation);
  EXECUTE format('CREATE POLICY numora_main_access ON public.%I FOR ALL TO numora_main_runtime USING(true) WITH CHECK(true)',relation);
 END LOOP;
END $$;
--> statement-breakpoint
GRANT UPDATE(report) ON public.content_imports TO numora_main_runtime;
--> statement-breakpoint
GRANT UPDATE(state,submit_key,submitted_at) ON public.content_preview_sessions TO numora_main_runtime;
--> statement-breakpoint
GRANT UPDATE(answer,revision,saved_at) ON public.content_preview_answers TO numora_main_runtime;
--> statement-breakpoint
CREATE FUNCTION public.content_preview_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='content_imports' AND TG_OP='UPDATE' AND OLD.report='{}'::jsonb AND
  (to_jsonb(NEW)-'report')=(to_jsonb(OLD)-'report') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Content import and preview evidence is immutable' USING ERRCODE='23514';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.content_preview_immutable_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER content_imports_immutable BEFORE UPDATE OR DELETE ON public.content_imports FOR EACH ROW EXECUTE FUNCTION public.content_preview_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER content_import_versions_immutable BEFORE UPDATE OR DELETE ON public.content_import_versions FOR EACH ROW EXECUTE FUNCTION public.content_preview_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER content_import_identities_immutable BEFORE UPDATE OR DELETE ON public.content_import_identities FOR EACH ROW EXECUTE FUNCTION public.content_preview_immutable_guard();
--> statement-breakpoint
CREATE TRIGGER content_preview_items_immutable BEFORE UPDATE OR DELETE ON public.content_preview_items FOR EACH ROW EXECUTE FUNCTION public.content_preview_immutable_guard();
--> statement-breakpoint
CREATE FUNCTION public.content_preview_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_state text; BEGIN
 IF TG_TABLE_NAME='content_preview_sessions' THEN
  IF OLD.state='SUBMITTED' OR (to_jsonb(NEW)-ARRAY['state','submit_key','submitted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','submit_key','submitted_at']) THEN
   RAISE EXCEPTION 'Preview session is immutable' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT s.state INTO parent_state FROM public.content_preview_sessions s JOIN public.content_preview_items i ON i.session_id=s.id WHERE i.id=NEW.item_id FOR UPDATE OF s;
  IF parent_state<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Preview answers are submitted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.item_id<>OLD.item_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Invalid preview revision' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.content_preview_state_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER content_preview_sessions_state BEFORE UPDATE ON public.content_preview_sessions FOR EACH ROW EXECUTE FUNCTION public.content_preview_state_guard();
--> statement-breakpoint
CREATE TRIGGER content_preview_answers_state BEFORE INSERT OR UPDATE ON public.content_preview_answers FOR EACH ROW EXECUTE FUNCTION public.content_preview_state_guard();
--> statement-breakpoint
CREATE FUNCTION public.content_import_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.content_import_versions WHERE question_version_id=OLD.id) THEN
  RAISE EXCEPTION 'Imported version is immutable; reimport JSON' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.content_import_version_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER content_import_version_immutable BEFORE UPDATE OR DELETE ON public.question_versions FOR EACH ROW EXECUTE FUNCTION public.content_import_version_guard();
