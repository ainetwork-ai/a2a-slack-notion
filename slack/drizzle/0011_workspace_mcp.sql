CREATE TABLE IF NOT EXISTS "workspace_mcp_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "server_id" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "config" jsonb,
  "added_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_mcp_unique" ON "workspace_mcp_integrations" ("workspace_id", "server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_mcp_workspace_idx" ON "workspace_mcp_integrations" ("workspace_id");
