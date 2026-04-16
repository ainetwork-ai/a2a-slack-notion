-- Add agent engagement level columns to channel_members
ALTER TABLE "channel_members"
  ADD COLUMN IF NOT EXISTS "engagement_level" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_auto_response_at" timestamp,
  ADD COLUMN IF NOT EXISTS "auto_response_count" integer NOT NULL DEFAULT 0;
