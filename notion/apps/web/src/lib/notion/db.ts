/**
 * Drizzle DB entry point for the notion routes.
 *
 * Re-exports the shared slack db so both apps share a single Neon Postgres
 * instance and schema.
 */

export { db, type DB } from '@slack-db/index';
export * from '@slack-db/schema';

// Alias for readability: slack schema exports `blockComments`, but the notion
// code commonly refers to them as `comments`.
export { blockComments as comments } from '@slack-db/schema';

// Alias: the notion code originally called the API keys table `apiKeys`.
export { notionApiKeys as apiKeys } from '@slack-db/schema';
