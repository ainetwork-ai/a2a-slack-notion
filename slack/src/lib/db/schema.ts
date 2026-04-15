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
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  iconText: text("icon_text").default("WS").notNull(),
  iconUrl: text("icon_url"),
  description: text("description"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
  a2aUrl: text("a2a_url"),
  agentCardJson: jsonb("agent_card_json"),
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

export const channels = pgTable("channels", {
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
});

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
