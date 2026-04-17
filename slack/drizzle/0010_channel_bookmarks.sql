-- Channel bookmarks bar: per-channel shortcuts (URL + emoji + title)
CREATE TABLE IF NOT EXISTS "channel_bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "emoji" text DEFAULT '🔖' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_bookmarks_channel_idx" ON "channel_bookmarks" ("channel_id", "position");
