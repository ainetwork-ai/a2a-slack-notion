import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { createLogger } from '@notion/shared';
import { prisma } from './lib/prisma.js';

const logger = createLogger('hocuspocus');

// Track last auto-snapshot time per document (in-memory, resets on server restart)
const lastSnapshotTime = new Map<string, number>();

// Single-instance Hocuspocus — no Redis pub/sub. If we ever need multi-node
// collab, reintroduce a dedicated broker here; Redis was removed from the
// stack entirely.

const server = new Server({
  // No authentication required — accept all connections
  async onAuthenticate({ documentName }: { documentName: string }) {
    logger.info({ documentName }, 'Connection accepted (no-auth mode)');
    return { user: { id: 'default' } };
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        try {
          const record = await prisma.block.findUnique({
            where: { id: documentName },
            select: { content: true },
          });

          if (record?.content && typeof record.content === 'object') {
            const data = record.content as Record<string, unknown>;
            const snapshot = data['yjsSnapshot'];
            if (snapshot && typeof snapshot === 'string') {
              return Buffer.from(snapshot, 'base64');
            }
          }
        } catch (err) {
          logger.error({ documentName, err }, 'Failed to fetch document from DB');
        }

        return null;
      },

      store: async ({ documentName, state }) => {
        try {
          const existing = await prisma.block.findUnique({
            where: { id: documentName },
            select: { content: true, properties: true },
          }).catch((err) => {
            logger.warn({ documentName, err }, 'findUnique failed during store — will upsert with empty content');
            return null;
          });

          const content = (existing?.content as Record<string, unknown>) ?? {};

          await prisma.block.upsert({
            where: { id: documentName },
            update: {
              content: {
                ...content,
                yjsSnapshot: Buffer.from(state).toString('base64'),
              } as Record<string, string>,
            },
            create: {
              id: documentName,
              type: 'page',
              pageId: documentName,
              workspaceId: '',
              createdBy: 'system',
              properties: {},
              content: {
                yjsSnapshot: Buffer.from(state).toString('base64'),
              } as Record<string, string>,
            },
          });

          logger.debug({ documentName, size: state.length }, 'Snapshot saved');

          // Auto-snapshot: save a PageSnapshot every hour (or on first store for this session)
          const now = Date.now();
          const lastTime = lastSnapshotTime.get(documentName) ?? 0;
          const ONE_HOUR = 3600000;
          if (now - lastTime > ONE_HOUR) {
            try {
              const title =
                ((existing?.properties as Record<string, unknown>)?.['title'] as string) ?? 'Untitled';
              await prisma.pageSnapshot.create({
                data: {
                  pageId: documentName,
                  title,
                  snapshot: Buffer.from(state),
                  createdBy: 'system',
                },
              });
              lastSnapshotTime.set(documentName, now);
              logger.debug({ documentName }, 'Auto-snapshot created');
            } catch (err) {
              // Non-fatal: log and continue
              logger.warn({ documentName, err }, 'Auto-snapshot failed');
            }
          }
        } catch (err) {
          logger.error({ documentName, err }, 'Failed to store document snapshot');
        }
      },
    }),
  ],

  async onDisconnect({ documentName }: { documentName: string }) {
    logger.info({ documentName }, 'User disconnected');
  },
});

export function startHocuspocus() {
  const port = Number(process.env['HOCUSPOCUS_PORT'] ?? 3012);
  server.listen(port, () => {
    logger.info(`Hocuspocus WebSocket server running on port ${port}`);
  });
}
