// Index definitions and schema for Meilisearch-backed global search.
// Each entry defines: index uid, primary key, searchable attributes, and filterable attributes.

export interface IndexDefinition {
  uid: string;
  primaryKey: string;
  searchableAttributes: string[];
  filterableAttributes: string[];
}

export const INDEX_MESSAGES: IndexDefinition = {
  uid: "messages",
  primaryKey: "id",
  searchableAttributes: ["content", "senderName"],
  filterableAttributes: [
    "workspaceId",
    "channelId",
    "conversationId",
    "senderId",
    "createdAt",
  ],
};

export const INDEX_PAGES: IndexDefinition = {
  uid: "pages",
  primaryKey: "id",
  searchableAttributes: ["title", "topic"],
  filterableAttributes: ["workspaceId", "archived", "createdBy"],
};

export const INDEX_BLOCKS: IndexDefinition = {
  uid: "blocks",
  primaryKey: "id",
  searchableAttributes: ["text"],
  filterableAttributes: ["workspaceId", "pageId", "type"],
};

export const INDEX_USERS: IndexDefinition = {
  uid: "users",
  primaryKey: "id",
  searchableAttributes: ["displayName", "ainAddress"],
  filterableAttributes: ["isAgent"],
};

export const ALL_INDEXES: IndexDefinition[] = [
  INDEX_MESSAGES,
  INDEX_PAGES,
  INDEX_BLOCKS,
  INDEX_USERS,
];

// Block types eligible for full-text indexing (skip structural/media blocks)
export const INDEXABLE_BLOCK_TYPES = new Set([
  "text",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "callout",
  "code",
  "quote",
]);
