-- Notion-core tables — ported from notion/apps/api/prisma/schema.prisma
-- "Everything is a Block" model: pages are blocks with type='page'.
-- Workspace/User/WorkspaceMember reuse existing slack tables.
-- Skipped in favor of slack equivalents: webhooks, notifications, api_keys.

CREATE TABLE IF NOT EXISTS "blocks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "type" text NOT NULL,
    "parent_id" uuid,
    "page_id" uuid NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "properties" jsonb DEFAULT '{}' NOT NULL,
    "content" jsonb DEFAULT '{}' NOT NULL,
    "children_order" jsonb DEFAULT '[]' NOT NULL,
    "created_by" uuid NOT NULL REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blocks_page_parent_idx" ON "blocks" ("page_id", "parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blocks_workspace_type_idx" ON "blocks" ("workspace_id", "type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blocks_parent_idx" ON "blocks" ("parent_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "database_views" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "database_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "type" text DEFAULT 'table' NOT NULL,
    "filters" jsonb DEFAULT '{"logic":"and","conditions":[]}' NOT NULL,
    "sorts" jsonb DEFAULT '[]' NOT NULL,
    "group_by" jsonb,
    "config" jsonb DEFAULT '{"visibleProperties":[]}' NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "database_views_db_pos_idx" ON "database_views" ("database_id", "position");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "database_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "database_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "icon" text,
    "content" jsonb DEFAULT '[]' NOT NULL,
    "values" jsonb DEFAULT '{}' NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "database_templates_db_pos_idx" ON "database_templates" ("database_id", "position");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "block_comments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "block_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "author_id" uuid NOT NULL REFERENCES "users"("id"),
    "content" jsonb NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL,
    "thread_id" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "block_comments_block_idx" ON "block_comments" ("block_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "favorites" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "page_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "favorites_user_page_unique" ON "favorites" ("user_id", "page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "favorites_user_workspace_idx" ON "favorites" ("user_id", "workspace_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "recent_pages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "page_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "visited_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recent_pages_user_page_unique" ON "recent_pages" ("user_id", "page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recent_pages_visit_idx" ON "recent_pages" ("user_id", "workspace_id", "visited_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_permissions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "level" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_permissions_page_user_unique" ON "page_permissions" ("page_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_permissions_page_idx" ON "page_permissions" ("page_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "snapshot" text NOT NULL,
    "created_by" uuid NOT NULL REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_snapshots_page_created_idx" ON "page_snapshots" ("page_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "share_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "page_id" uuid NOT NULL REFERENCES "blocks"("id") ON DELETE CASCADE,
    "token" text UNIQUE NOT NULL,
    "level" text DEFAULT 'can_view' NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_page_idx" ON "share_links" ("page_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "page_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "icon" text,
    "category" text DEFAULT 'custom' NOT NULL,
    "content" jsonb DEFAULT '[]' NOT NULL,
    "created_by" uuid NOT NULL REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_templates_workspace_cat_idx" ON "page_templates" ("workspace_id", "category");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "automations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "trigger" jsonb NOT NULL,
    "actions" jsonb NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" uuid NOT NULL REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Bridge: link existing slack canvases to notion pages (FK into blocks where type='page').
-- Nullable during cutover; migrator backfills by converting canvas.content markdown to block tree.
ALTER TABLE "canvases" ADD COLUMN IF NOT EXISTS "page_id" uuid REFERENCES "blocks"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvases_page_idx" ON "canvases" ("page_id");
