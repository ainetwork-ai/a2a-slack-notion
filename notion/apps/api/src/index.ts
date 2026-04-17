import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { eq } from 'drizzle-orm';
import { createLogger, API_BASE_PATH } from '@notion/shared';
import { traceMiddleware } from './middleware/trace.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.js';
import { db } from './lib/db.js';
import { users } from '../../../slack/src/lib/db/schema';
import { authRoutes } from './routes/auth.js';
import { workspaces } from './routes/workspaces.js';
import { pages } from './routes/pages.js';
import { databases } from './routes/databases.js';
import { blocks } from './routes/blocks.js';
import { favorites } from './routes/favorites.js';
import { recent } from './routes/recent.js';
import { files } from './routes/files.js';
import { comments } from './routes/comments.js';
import { search } from './routes/search.js';
import { mentions } from './routes/mentions.js';
import { permissions } from './routes/permissions.js';
import { notifications } from './routes/notifications.js';
import { pageShareRoutes, shareTokenRoutes } from './routes/share.js';
import { history } from './routes/history.js';
import { trash } from './routes/trash.js';
import { apiKeys } from './routes/api-keys.js';
import { templates } from './routes/templates.js';
import { automations } from './routes/automations.js';
import { webhooks } from './routes/webhooks.js';
import { exportRoutes } from './routes/export.js';
import { importRoutes } from './routes/import.js';
import { startHocuspocus } from './hocuspocus.js';
import { ensureSearchIndex } from './lib/search.js';
import { setupEventHandlers } from './lib/event-handlers.js';
import { startNotificationWorker } from './workers/notification-worker.js';
import { startWebhookWorker } from './workers/webhook-worker.js';
import type { AuthenticatedUser } from './types/auth.js';
import type { AppVariables } from './types/app.js';

const app = new Hono<{ Variables: AppVariables }>();
const logger = createLogger('api');

// Global middleware
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';
      if (!origin || origin === allowed) return origin;
      return allowed;
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);
app.use('*', traceMiddleware);
app.onError(errorHandler);

// Auth routes (nonce, verify, logout, session)
app.route('/api/auth', authRoutes);

// Notion-Version header on all API responses
app.use(`${API_BASE_PATH}/*`, async (c, next) => {
  await next();
  c.header('Notion-Version', '2026-04-15');
});

// Default user middleware — no authentication required, always use a fixed default user.
// The slack schema uses `ainAddress` (unique) for the AIN wallet identifier and
// `displayName` for the user's display name — there is no `walletAddress`/`name`/`image`.
// We map those to the AuthenticatedUser shape the API already exposes.
app.use(`${API_BASE_PATH}/*`, async (c, next) => {
  const DEFAULT_ADDR = 'default';
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.ainAddress, DEFAULT_ADDR))
    .limit(1)
    .then((r) => r[0]);

  const row =
    existing ??
    (await db
      .insert(users)
      .values({ ainAddress: DEFAULT_ADDR, displayName: 'Default User' })
      .returning()
      .then((r) => r[0]!));

  const defaultUser: AuthenticatedUser = {
    id: row.id,
    walletAddress: row.ainAddress,
    name: row.displayName,
    image: row.avatarUrl ?? null,
    createdAt: row.createdAt,
  };
  c.set('user', defaultUser);
  await next();
});

// Rate limiting — applied after auth so we can key by userId
app.use(`${API_BASE_PATH}/*`, rateLimit());

// Health check
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// API v1 routes
const api = new Hono<{ Variables: AppVariables }>();

api.get('/ping', (c) => c.json({ message: 'pong' }));
api.route('/workspaces', workspaces);
api.route('/pages', pages);
api.route('/databases', databases);
api.route('/blocks', blocks);
api.route('/favorites', favorites);
api.route('/recent', recent);
api.route('/files', files);
api.route('/comments', comments);
api.route('/search', search);
api.route('/mentions', mentions);
api.route('/pages/:pageId/permissions', permissions);
api.route('/notifications', notifications);
api.route('/pages/:pageId/share', pageShareRoutes);
api.route('/share', shareTokenRoutes);
api.route('/pages/:pageId/history', history);
api.route('/trash', trash);
api.route('/api-keys', apiKeys);
api.route('/templates', templates);
api.route('/automations', automations);
api.route('/webhooks', webhooks);
api.route('/pages/:pageId/export', exportRoutes);
api.route('/import', importRoutes);

api.get('/me', (c) => {
  const user = c.get('user');
  return c.json(user);
});

// Mount AFTER all routes are registered (Hono copies routes at mount time)
app.route(API_BASE_PATH, api);

// Start server
const port = Number(process.env['API_PORT'] ?? 3001);
logger.info(`Starting API server on port ${port}`);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`API server running at http://localhost:${info.port}`);
});

// Start Hocuspocus WebSocket server for real-time collaboration
startHocuspocus();

// Initialize search index (best-effort, non-blocking)
ensureSearchIndex().catch(() => {});

// Wire application events to BullMQ notification queues
setupEventHandlers();

// Start BullMQ notification worker
startNotificationWorker();

// Start BullMQ webhook delivery worker
startWebhookWorker();

export default app;
export type AppType = typeof app;
