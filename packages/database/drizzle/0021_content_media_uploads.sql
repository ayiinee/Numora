CREATE TABLE "content_media_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"external_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"bucket" text NOT NULL,
	"pending_object_key" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "content_media_uploads_size_ck" CHECK ("content_media_uploads"."byte_length" > 0 and "content_media_uploads"."byte_length" <= 5242880),
	CONSTRAINT "content_media_uploads_version_ck" CHECK ("content_media_uploads"."content_version" > 0),
	CONSTRAINT "content_media_uploads_sha256_ck" CHECK ("content_media_uploads"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "content_media_uploads_type_ck" CHECK ("content_media_uploads"."content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "content_media_uploads_status_ck" CHECK (("content_media_uploads"."status" = 'PENDING' and "content_media_uploads"."verified_at" is null) or ("content_media_uploads"."status" = 'VERIFIED' and "content_media_uploads"."verified_at" is not null)),
	CONSTRAINT "content_media_uploads_expiry_ck" CHECK ("content_media_uploads"."expires_at" > "content_media_uploads"."created_at")
);
--> statement-breakpoint
ALTER TABLE "content_media_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_media_uploads" ADD CONSTRAINT "content_media_uploads_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_media_uploads_actor_idempotency_uq" ON "content_media_uploads" USING btree ("actor_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_media_uploads_pending_key_uq" ON "content_media_uploads" USING btree ("bucket","pending_object_key");--> statement-breakpoint
CREATE INDEX "content_media_uploads_actor_time_idx" ON "content_media_uploads" USING btree ("actor_user_id","created_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.content_media_uploads TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.content_media_uploads FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
