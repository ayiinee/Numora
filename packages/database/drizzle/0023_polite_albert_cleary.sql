CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"recipient_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"audience_before" timestamp with time zone DEFAULT now() NOT NULL,
	"cursor" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failed_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	CONSTRAINT "notification_outbox_kind_ck" CHECK ("notification_outbox"."kind" in ('SYSTEM_STARTED', 'FEEDBACK_RECEIVED', 'PVP_INVITED', 'TRYOUT_OPENED', 'TRYOUT_RESULT_READY', 'LEVEL_UNLOCKED')),
	CONSTRAINT "notification_outbox_recipient_ck" CHECK ("notification_outbox"."recipient_id" is not null or "notification_outbox"."kind" in ('SYSTEM_STARTED', 'TRYOUT_OPENED')),
	CONSTRAINT "notification_outbox_attempts_ck" CHECK ("notification_outbox"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"context" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_kind_ck" CHECK ("notifications"."kind" in ('FEEDBACK_RECEIVED', 'PVP_INVITED', 'TRYOUT_OPENED', 'TRYOUT_RESULT_READY', 'LEVEL_UNLOCKED')),
	CONSTRAINT "notifications_read_at_ck" CHECK ("notifications"."read_at" is null or "notifications"."read_at" >= "notifications"."created_at")
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "material_category" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_source_uq" ON "notification_outbox" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_pending_idx" ON "notification_outbox" USING btree ("occurred_at","id") WHERE "notification_outbox"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_recipient_source_uq" ON "notifications" USING btree ("recipient_id","source_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_time_idx" ON "notifications" USING btree ("recipient_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("recipient_id","occurred_at") WHERE "notifications"."read_at" is null;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_category_ck" CHECK ("chapters"."material_category" is null or "chapters"."material_category" in ('algebra', 'geometry', 'numbers', 'statistics'));
--> statement-breakpoint
REVOKE ALL ON public.notifications, public.notification_outbox FROM PUBLIC;
--> statement-breakpoint
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON public.notifications, public.notification_outbox FROM %I',r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.notifications,public.notification_outbox TO numora_main_runtime;
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.notifications FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY numora_main_access ON public.notification_outbox FOR ALL TO numora_main_runtime USING (true) WITH CHECK (true);
--> statement-breakpoint
INSERT INTO public.notification_outbox(source_key,kind,source_id,processed_at) VALUES ('SYSTEM_STARTED','SYSTEM_STARTED','00000000-0000-4000-8000-000000000000',clock_timestamp());
