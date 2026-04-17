-- Notion-auxiliary tables: notifications, outbound webhooks, and API keys.
-- These are Notion-domain tables kept separate from slack equivalents.

CREATE TABLE IF NOT EXISTS "notion_notifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "body" text,
    "page_id" uuid,
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notion_notifications_user_idx" ON "notion_notifications" ("user_id", "read", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notion_webhooks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "url" text NOT NULL,
    "secret" text NOT NULL,
    "events" jsonb NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notion_api_keys" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "key_hash" text UNIQUE NOT NULL,
    "key_prefix" text NOT NULL,
    "last_used_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);
