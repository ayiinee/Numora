CREATE TYPE "public"."admin_invitation_status" AS ENUM('RESERVED', 'SENDING', 'INVITED', 'FAILED', 'ACCEPTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"target_role" "admin_role" NOT NULL,
	"status" "admin_invitation_status" DEFAULT 'RESERVED' NOT NULL,
	"auth_user_id" uuid,
	"user_id" uuid,
	"failure_code" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "admin_invitations_email_ck" CHECK ("admin_invitations"."email" = lower(trim("admin_invitations"."email")) and length("admin_invitations"."email") > 3),
	CONSTRAINT "admin_invitations_accepted_ck" CHECK ("admin_invitations"."status" <> 'ACCEPTED' or ("admin_invitations"."user_id" is not null and "admin_invitations"."auth_user_id" is not null and "admin_invitations"."accepted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "admin_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invitations_actor_key_uq" ON "admin_invitations" USING btree ("actor_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invitations_live_email_uq" ON "admin_invitations" USING btree ("email") WHERE "admin_invitations"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "admin_invitations_state_time_idx" ON "admin_invitations" USING btree ("status","updated_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.admin_invitations TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.admin_invitations FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
