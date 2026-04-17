-- Canvas pipeline: drop channelId unique constraint, add pipeline fields
--> statement-breakpoint
ALTER TABLE "canvases" DROP CONSTRAINT IF EXISTS "canvases_channel_id_unique";
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "pipeline_status" text;
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "topic" text;
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "pipeline_run_id" uuid;
