import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").unique().notNull(),
  iconText: text("icon_text").default("WS").notNull(),
  iconUrl: text("icon_url"),
  description: text("description"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  defaultNotificationPref: text("default_notification_pref").default("all").notNull(),
  defaultChannels: jsonb("default_channels").$type<string[]>().default([]),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  ainAddress: text("ain_address").unique().notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  status: text("status").default("offline").notNull(),
  statusMessage: text("status_message"),
  statusEmoji: text("status_emoji"),
  statusExpiresAt: timestamp("status_expires_at"),
  isAgent: boolean("is_agent").default(false).notNull(),
  a2aId: text("a2a_id").unique(),
  a2aUrl: text("a2a_url"),
  agentCardJson: jsonb("agent_card_json"),
  agentInvitedBy: uuid("agent_invited_by"),
  agentVisibility: text("agent_visibility").default("private"),
  agentCategory: text("agent_category"),
  agentTags: jsonb("agent_tags").$type<string[]>().default([]),
  encryptedPrivateKey: text("encrypted_private_key"),
  ownerId: uuid("owner_id"),
  timezone: text("timezone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("workspace_members_pk").on(t.workspaceId, t.userId),
  ]
);

export const inviteTokens = pgTable("invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").unique().notNull(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    isPrivate: boolean("is_private").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Only one active (non-archived) channel per (workspace, name).
    // Archived channels keep their original name so scroll-back references stay valid.
    uniqueIndex("channels_workspace_name_active")
      .on(t.workspaceId, t.name)
      .where(sql`${t.isArchived} = false`),
  ]
);

export const channelFolders = pgTable(
  "channel_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("channel_folders_user_workspace_idx").on(t.userId, t.workspaceId)]
);

export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: uuid("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    folderId: uuid("folder_id").references(() => channelFolders.id, {
      onDelete: "set null",
    }),
    role: text("role").default("member").notNull(),
    notificationPref: text("notification_pref").default("all").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    engagementLevel: integer("engagement_level").default(0).notNull(),
    lastAutoResponseAt: timestamp("last_auto_response_at"),
    autoResponseCount: integer("auto_response_count").default(0).notNull(),
  },
  (t) => [
    uniqueIndex("channel_members_pk").on(t.channelId, t.userId),
  ]
);

export const dmConversations = pgTable("dm_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dmMembers = pgTable(
  "dm_members",
  {
    conversationId: uuid("conversation_id")
      .references(() => dmConversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    isMuted: boolean("is_muted").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("dm_members_pk").on(t.conversationId, t.userId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").references(() => channels.id, {
      onDelete: "cascade",
    }),
    conversationId: uuid("conversation_id").references(
      () => dmConversations.id,
      { onDelete: "cascade" }
    ),
    parentId: uuid("parent_id"),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    content: text("content").notNull(),
    contentType: text("content_type").default("text").notNull(),
    metadata: jsonb("metadata"),
    threadCount: integer("thread_count").default(0).notNull(),
    isEdited: boolean("is_edited").default(false).notNull(),
    pinnedAt: timestamp("pinned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("messages_channel_idx").on(t.channelId, t.createdAt),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_parent_idx").on(t.parentId),
  ]
);

export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("reactions_unique").on(t.messageId, t.userId, t.emoji),
  ]
);

export const mentions = pgTable(
  "mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("mentions_user_idx").on(t.userId)]
);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .references(() => messages.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.isRead)]
);

export const typingStatus = pgTable("typing_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id"),
  conversationId: uuid("conversation_id"),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("bookmarks_user_message_unique").on(table.userId, table.messageId),
  ]
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    remindAt: timestamp("remind_at").notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reminders_user_idx").on(t.userId, t.isCompleted, t.remindAt)]
);

export const threadSubscriptions = pgTable(
  "thread_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("thread_subscriptions_unique").on(t.userId, t.messageId),
    index("thread_subscriptions_message_idx").on(t.messageId),
  ]
);

export const blockedUsers = pgTable(
  "blocked_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    blockedUserId: uuid("blocked_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("blocked_users_unique").on(t.userId, t.blockedUserId),
    index("blocked_users_user_idx").on(t.userId),
  ]
);

export const scheduledMessages = pgTable(
  "scheduled_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => dmConversations.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    isSent: boolean("is_sent").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("scheduled_messages_user_idx").on(t.userId, t.isSent),
    index("scheduled_messages_time_idx").on(t.scheduledFor, t.isSent),
  ]
);

export const channelMcpIntegrations = pgTable(
  "channel_mcp_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
    serverId: text("server_id").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    config: jsonb("config"),
    addedBy: uuid("added_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("channel_mcp_unique").on(t.channelId, t.serverId),
    index("channel_mcp_channel_idx").on(t.channelId),
  ]
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    token: text("token").unique().notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("webhooks_token_unique").on(t.token),
    index("webhooks_workspace_idx").on(t.workspaceId),
  ]
);

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_memories_unique").on(t.agentId, t.key),
    index("agent_memories_agent_idx").on(t.agentId),
  ]
);

export const customCommands = pgTable(
  "custom_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    responseText: text("response_text").notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("custom_commands_workspace_name_unique").on(t.workspaceId, t.name),
    index("custom_commands_workspace_idx").on(t.workspaceId),
  ]
);

export const outgoingWebhooks = pgTable(
  "outgoing_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    triggerWords: text("trigger_words").notNull(),
    url: text("url").notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("outgoing_webhooks_workspace_idx").on(t.workspaceId),
  ]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_workspace_idx").on(t.workspaceId, t.createdAt),
    index("audit_logs_user_idx").on(t.userId),
  ]
);

export const messageEdits = pgTable(
  "message_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    previousContent: text("previous_content").notNull(),
    editedBy: uuid("edited_by")
      .references(() => users.id)
      .notNull(),
    editedAt: timestamp("edited_at").defaultNow().notNull(),
  },
  (t) => [index("message_edits_message_idx").on(t.messageId)]
);

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  triggerConfig: jsonb("trigger_config").default({}),
  steps: jsonb("steps").default([]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id")
    .references(() => workflows.id, { onDelete: "cascade" })
    .notNull(),
  status: text("status").default("pending").notNull(),
  triggeredBy: uuid("triggered_by").references(() => users.id),
  variables: jsonb("variables").default({}),
  currentStepIndex: integer("current_step_index").default(0),
  pendingInput: jsonb("pending_input"),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const canvases = pgTable("canvases", {
  id: uuid("id").primaryKey().defaultRandom(),
  // channelId is no longer unique — multiple canvases (one per article) can belong to the same channel
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => dmConversations.id, { onDelete: "cascade" }).unique(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Pipeline fields for structured newsroom/multi-agent workflows
  pipelineStatus: text("pipeline_status").$type<"draft" | "edited" | "fact-checked" | "published">(),
  topic: text("topic"),
  pipelineRunId: uuid("pipeline_run_id"),
  // Bridge to Notion block tree (type='page' in blocks table). Null during cutover window.
  pageId: uuid("page_id"),
});

export const canvasRevisions = pgTable("canvas_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id").references(() => canvases.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  editedBy: uuid("edited_by").references(() => users.id).notNull(),
  editedAt: timestamp("edited_at").defaultNow().notNull(),
});

export const channelBookmarks = pgTable(
  "channel_bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    emoji: text("emoji").default("🔖").notNull(),
    position: integer("position").default(0).notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("channel_bookmarks_channel_idx").on(t.channelId, t.position)]
);

export const agentSkillConfigs = pgTable(
  "agent_skill_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    skillId: text("skill_id").notNull(),
    instruction: text("instruction").notNull(),
    mcpTools: jsonb("mcp_tools").$type<string[]>().default([]),
    outputFormat: text("output_format").default("text"),
    temperature: integer("temperature"),
    maxTokens: integer("max_tokens").default(2000),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_skill_configs_unique").on(t.agentId, t.skillId),
  ]
);

export const editorialBriefs = pgTable(
  "editorial_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    incidentId: text("incident_id").notNull(),
    requestId: text("request_id").notNull(),
    purposeId: text("purpose_id").notNull(),
    legalBasis: text("legal_basis").notNull(),
    publicSafeBrief: text("public_safe_brief").notNull(),
    holdBackItems: jsonb("hold_back_items").$type<string[]>().default([]),
    verificationChecklist: jsonb("verification_checklist").$type<string[]>().default([]),
    sourceExposureRiskScore: integer("source_exposure_risk_score"),
    teePlatform: text("tee_platform"),
    signingAddress: text("signing_address"),
    chatId: text("chat_id"),
    attestationEvidenceId: text("attestation_evidence_id"),
    attestationVerified: boolean("attestation_verified").default(false).notNull(),
    intelTdxVerified: boolean("intel_tdx_verified").default(false),
    nvidiaNrasVerdict: text("nvidia_nras_verdict"),
    responseSignatureVerified: boolean("response_signature_verified").default(false),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("editorial_briefs_workspace_idx").on(t.workspaceId, t.createdAt),
    index("editorial_briefs_incident_idx").on(t.incidentId),
    index("editorial_briefs_expires_idx").on(t.expiresAt),
  ]
);

// ============================================================
// Notion-core tables — ported from notion/apps/api/prisma/schema.prisma
// ============================================================

export type BlockType =
  | "page"
  | "text"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list"
  | "numbered_list"
  | "to_do"
  | "toggle"
  | "callout"
  | "code"
  | "divider"
  | "image"
  | "quote"
  | "table"
  | "bookmark"
  | "file"
  | "embed"
  | "database";

export type ViewType = "table" | "board" | "list" | "calendar" | "gallery" | "timeline";

export type PermissionLevel = "full_access" | "can_edit" | "can_comment" | "can_view";

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<BlockType>().notNull(),
    parentId: uuid("parent_id"),
    pageId: uuid("page_id").notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().default({}).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().default({}).notNull(),
    childrenOrder: jsonb("children_order").$type<string[]>().default([]).notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archived: boolean("archived").default(false).notNull(),
  },
  (t) => [
    index("blocks_page_parent_idx").on(t.pageId, t.parentId),
    index("blocks_workspace_type_idx").on(t.workspaceId, t.type),
    index("blocks_parent_idx").on(t.parentId),
  ]
);

export const databaseViews = pgTable(
  "database_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    type: text("type").$type<ViewType>().default("table").notNull(),
    filters: jsonb("filters")
      .$type<{ logic: "and" | "or"; conditions: unknown[] }>()
      .default({ logic: "and", conditions: [] })
      .notNull(),
    sorts: jsonb("sorts").$type<unknown[]>().default([]).notNull(),
    groupBy: jsonb("group_by").$type<unknown>(),
    config: jsonb("config")
      .$type<{ visibleProperties: string[] }>()
      .default({ visibleProperties: [] })
      .notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("database_views_db_pos_idx").on(t.databaseId, t.position)]
);

export const databaseTemplates = pgTable(
  "database_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    databaseId: uuid("database_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    content: jsonb("content").$type<unknown[]>().default([]).notNull(),
    values: jsonb("values").$type<Record<string, unknown>>().default({}).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("database_templates_db_pos_idx").on(t.databaseId, t.position)]
);

export const blockComments = pgTable(
  "block_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockId: uuid("block_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    authorId: uuid("author_id")
      .references(() => users.id)
      .notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    resolved: boolean("resolved").default(false).notNull(),
    threadId: uuid("thread_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("block_comments_block_idx").on(t.blockId)]
);

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    pageId: uuid("page_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("favorites_user_page_unique").on(t.userId, t.pageId),
    index("favorites_user_workspace_idx").on(t.userId, t.workspaceId),
  ]
);

export const recentPages = pgTable(
  "recent_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    pageId: uuid("page_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    visitedAt: timestamp("visited_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("recent_pages_user_page_unique").on(t.userId, t.pageId),
    index("recent_pages_visit_idx").on(t.userId, t.workspaceId, t.visitedAt),
  ]
);

export const pagePermissions = pgTable(
  "page_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    level: text("level").$type<PermissionLevel>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("page_permissions_page_user_unique").on(t.pageId, t.userId),
    index("page_permissions_page_idx").on(t.pageId),
  ]
);

export const pageSnapshots = pgTable(
  "page_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    snapshot: text("snapshot").notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("page_snapshots_page_created_idx").on(t.pageId, t.createdAt)]
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .references(() => blocks.id, { onDelete: "cascade" })
      .notNull(),
    token: text("token").unique().notNull(),
    level: text("level").$type<PermissionLevel>().default("can_view").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("share_links_page_idx").on(t.pageId)]
);

export const pageTemplates = pgTable(
  "page_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    category: text("category").default("custom").notNull(),
    content: jsonb("content").$type<unknown[]>().default([]).notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("page_templates_workspace_cat_idx").on(t.workspaceId, t.category)]
);

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  trigger: jsonb("trigger").$type<unknown>().notNull(),
  actions: jsonb("actions").$type<unknown[]>().notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// Notion-auxiliary tables — page notifications, webhooks, api keys
// ============================================================

export const notionNotifications = pgTable(
  "notion_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").$type<"mention" | "comment" | "page_update">().notNull(),
    title: text("title").notNull(),
    body: text("body"),
    pageId: uuid("page_id"),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notion_notifications_user_read_idx").on(t.userId, t.read, t.createdAt)]
);

export const notionWebhooks = pgTable("notion_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: jsonb("events").$type<string[]>().notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notionApiKeys = pgTable("notion_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").unique().notNull(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
