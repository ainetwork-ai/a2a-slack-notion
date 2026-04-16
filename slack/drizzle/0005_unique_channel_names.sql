ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agent_invited_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agent_visibility" text DEFAULT 'private';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agent_category" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agent_tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "pending_input" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channels_workspace_name_active" ON "channels" USING btree ("workspace_id","name") WHERE "channels"."is_archived" = false;