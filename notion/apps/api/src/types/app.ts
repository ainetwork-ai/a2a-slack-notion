/**
 * Hono context variables shared across the Notion API.
 *
 * Notion's own auth layer was removed — the API is public. A default user is
 * injected by the middleware in index.ts so existing routes that persist
 * `createdBy`/`userId` columns still work unchanged.
 */
export type DefaultUser = {
  id: string;
  walletAddress: string;
  name: string;
  image: string | null;
  createdAt: Date;
};

export type AppVariables = {
  traceId: string;
  user: DefaultUser;
};
