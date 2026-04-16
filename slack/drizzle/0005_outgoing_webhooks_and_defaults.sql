-- Add default notification pref and default channels to workspaces
ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "default_notification_pref" text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS "default_channels" jsonb DEFAULT '[]'::jsonb;

-- Create outgoing_webhooks table
CREATE TABLE IF NOT EXISTS "outgoing_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "channel_id" uuid REFERENCES "channels"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "trigger_words" text NOT NULL,
  "url" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outgoing_webhooks_workspace_idx" ON "outgoing_webhooks" ("workspace_id");
