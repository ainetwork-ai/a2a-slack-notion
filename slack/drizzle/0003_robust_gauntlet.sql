CREATE TABLE "channel_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_mcp_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"server_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"added_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid,
	"conversation_id" uuid,
	"content" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"is_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_members" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_folders" ADD CONSTRAINT "channel_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_folders" ADD CONSTRAINT "channel_folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mcp_integrations" ADD CONSTRAINT "channel_mcp_integrations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mcp_integrations" ADD CONSTRAINT "channel_mcp_integrations_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversation_id_dm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_folders_user_workspace_idx" ON "channel_folders" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_mcp_unique" ON "channel_mcp_integrations" USING btree ("channel_id","server_id");--> statement-breakpoint
CREATE INDEX "channel_mcp_channel_idx" ON "channel_mcp_integrations" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "scheduled_messages_user_idx" ON "scheduled_messages" USING btree ("user_id","is_sent");--> statement-breakpoint
CREATE INDEX "scheduled_messages_time_idx" ON "scheduled_messages" USING btree ("scheduled_for","is_sent");--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_folder_id_channel_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."channel_folders"("id") ON DELETE set null ON UPDATE no action;