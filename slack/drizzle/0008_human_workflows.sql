-- Add pending_input column to workflow_runs for pause/resume support
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "pending_input" jsonb;
