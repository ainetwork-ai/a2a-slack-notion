CREATE TABLE IF NOT EXISTS "workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "trigger_type" text NOT NULL,
  "trigger_config" jsonb DEFAULT '{}',
  "steps" jsonb DEFAULT '[]' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL,
  "triggered_by" uuid REFERENCES "users"("id"),
  "variables" jsonb DEFAULT '{}',
  "current_step_index" integer DEFAULT 0,
  "error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_idx" ON "workflow_runs"("workflow_id");
CREATE INDEX IF NOT EXISTS "workflows_workspace_idx" ON "workflows"("workspace_id");
