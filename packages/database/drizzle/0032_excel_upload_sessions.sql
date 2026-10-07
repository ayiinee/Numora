CREATE TABLE "content_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"object_key" text,
	"state" text DEFAULT 'RECEIVED' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"preview" jsonb,
	"report" jsonb,
	"error" text,
	"package_id" uuid,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_upload_state_ck" CHECK ("content_upload_sessions"."state" in ('RECEIVED','INVALID','PREVIEW','VALIDATED','SAVED')),
	CONSTRAINT "content_upload_revision_ck" CHECK ("content_upload_sessions"."revision" >= 0 and "content_upload_sessions"."byte_length" >= 0)
);
--> statement-breakpoint
ALTER TABLE "content_upload_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_upload_sessions" ADD CONSTRAINT "content_upload_sessions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_upload_sessions" ADD CONSTRAINT "content_upload_sessions_package_id_assessment_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."assessment_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_upload_sessions" ADD CONSTRAINT "content_upload_sessions_import_id_content_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."content_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_upload_operation_uq" ON "content_upload_sessions" USING btree ("actor_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "content_upload_created_idx" ON "content_upload_sessions" USING btree ("created_at");
--> statement-breakpoint
REVOKE ALL ON public.content_upload_sessions FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.content_upload_sessions FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.content_upload_sessions FROM authenticated; END IF;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.content_upload_sessions TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.content_upload_sessions FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Preserve the latest existing package import in history. Original workbooks were not retained before V5.
INSERT INTO public.content_upload_sessions (id,actor_user_id,idempotency_key,file_name,file_sha256,byte_length,state,report,package_id,import_id,created_at,updated_at)
SELECT DISTINCT ON (p.id) gen_random_uuid(), i.actor_user_id, 'legacy-' || p.id::text,
 coalesce((SELECT v.provenance->>'fileName' FROM public.content_import_versions v WHERE v.import_id=i.id AND v.provenance->>'fileName' IS NOT NULL LIMIT 1),p.name || ' (unggahan lama)'),
 coalesce((SELECT v.provenance->>'sourceFileSha256' FROM public.content_import_versions v WHERE v.import_id=i.id LIMIT 1),''),0,'SAVED',i.report,p.id,i.id,i.created_at,i.created_at
FROM public.content_imports i JOIN public.assessment_packages p ON p.id::text=i.report->'package'->>'packageId'
WHERE p.import_source IS NOT NULL ORDER BY p.id,i.created_at DESC
ON CONFLICT DO NOTHING;
