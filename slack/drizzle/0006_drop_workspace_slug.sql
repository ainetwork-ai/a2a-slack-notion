ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "workspaces_slug_unique";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "slug";--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_name_unique" UNIQUE("name");