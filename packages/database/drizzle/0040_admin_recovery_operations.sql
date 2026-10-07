CREATE TYPE "public"."admin_recovery_status" AS ENUM('RESERVED', 'SENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "admin_recovery_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "admin_recovery_status" DEFAULT 'RESERVED' NOT NULL,
	"failure_code" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_recovery_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_recovery_operations" ADD CONSTRAINT "admin_recovery_operations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_operations" ADD CONSTRAINT "admin_recovery_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_recovery_actor_key_uq" ON "admin_recovery_operations" USING btree ("actor_user_id","idempotency_key");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.admin_recovery_operations TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.admin_recovery_operations FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
