/**
 * Drizzle DB entry point for the notion API.
 *
 * Re-exports the shared slack db so both apps share a single Neon Postgres
 * instance and schema. Notion-auxiliary tables (notionNotifications,
 * notionWebhooks, notionApiKeys) are now canonical in the slack schema and
 * simply re-exported here.
 */

export { db, type DB } from '../../../../slack/src/lib/db';
export * from '../../../../slack/src/lib/db/schema';

// -----------------------------------------------------------------------------
// Notion-only: block-level comments, distinct from slack's reactions/etc.
// The slack schema already has a `blockComments` table but only for blocks;
// we re-export it under the legacy name `comments` so route code reads naturally.
// -----------------------------------------------------------------------------

// Alias for readability: slack schema exports `blockComments`, but the notion
// code commonly refers to them as `comments`.
export { blockComments as comments } from '../../../../slack/src/lib/db/schema';

// Alias: the notion code originally called the API keys table `apiKeys`.
// The canonical name in slack schema is `notionApiKeys`; re-export both.
export { notionApiKeys as apiKeys } from '../../../../slack/src/lib/db/schema';
