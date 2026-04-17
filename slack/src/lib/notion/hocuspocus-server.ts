/**
 * Hocuspocus WebSocket collaboration server for Notion-style page editing.
 *
 * Ported from notion/apps/api/src/hocuspocus.ts and adapted for:
 *   - Drizzle ORM (slack's db client) instead of Prisma
 *   - iron-session cookie auth ("slack-a2a-session") instead of no-auth
 *   - pageSnapshots table for version history (base64-encoded Y.Doc state)
 *   - blocks table for live document state
 *
 * @ts-expect-error comments below mark imports that require `pnpm install` to resolve.
 */

// @ts-expect-error - @hocuspocus/server not yet installed; resolves after pnpm install
import { Server, type onAuthenticatePayload, type onLoadDocumentPayload, type onStoreDocumentPayload } from '@hocuspocus/server';
// @ts-expect-error - @hocuspocus/extension-database not yet installed; resolves after pnpm install
import { Database } from '@hocuspocus/extension-database';
// @ts-expect-error - yjs not yet installed; resolves after pnpm install
import * as Y from 'yjs';
import { db } from '@/lib/db';
import { blocks, pageSnapshots } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getIronSession } from 'iron-session';
import { onPageUpdated } from '@/lib/search/hooks';

// ─── Session auth ───────────────────────────────────────────────────────────

const SESSION_COOKIE = 'slack-a2a-session';
const SESSION_PASSWORD =
  process.env.SESSION_SECRET ?? 'dev-secret-change-in-production-32ch';

/**
 * Parse raw Cookie header string into a key→value map.
 * Hocuspocus surfaces the raw HTTP headers on the socket request; we
 * reconstruct a minimal Request/Response pair to hand to iron-session.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

// ─── Track last auto-snapshot time per document (resets on server restart) ──

const lastSnapshotTime = new Map<string, number>();
const ONE_HOUR = 3_600_000;

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createHocuspocus(): Server {
  return new Server({
    /**
     * Auth middleware — validates the iron-session cookie.
     *
     * Hocuspocus passes `requestHeaders` (a plain object from the HTTP upgrade
     * request) and `requestParameters` on the payload. We reconstruct a minimal
     * cookie jar and call iron-session's `getIronSession` to unseal it.
     *
     * TODO: If the WebSocket upgrade request arrives without standard HTTP
     * headers (e.g. via a custom transport), fall back to checking a
     * `token` query parameter and validate it against the sessions table.
     */
    async onAuthenticate(payload: onAuthenticatePayload) {
      const cookieHeader =
        (payload.requestHeaders?.['cookie'] as string | undefined) ?? '';

      if (!cookieHeader) {
        throw new Error('Unauthorized: no cookies on WebSocket upgrade request');
      }

      const cookies = parseCookies(cookieHeader);
      const rawSession = cookies[SESSION_COOKIE];

      if (!rawSession) {
        throw new Error(`Unauthorized: cookie "${SESSION_COOKIE}" not found`);
      }

      // Reconstruct a minimal Request / Response pair for iron-session
      const req = new Request('http://localhost', {
        headers: { cookie: cookieHeader },
      });
      // iron-session needs a Response to write Set-Cookie back — we discard it
      const res = new Response();

      const session = await getIronSession(req, res, {
        password: SESSION_PASSWORD,
        cookieName: SESSION_COOKIE,
      });

      const userId: string | undefined = (session as { userId?: string }).userId;

      if (!userId) {
        throw new Error('Unauthorized: invalid or expired session');
      }

      return { user: { id: userId } };
    },

    extensions: [
      new Database({
        /**
         * Load the latest Y.Doc state for a page from pageSnapshots.
         * Falls back to the yjsSnapshot embedded in blocks.content (legacy path).
         */
        fetch: async ({ documentName }: { documentName: string }) => {
          // 1. Try pageSnapshots (primary store)
          const [snapshot] = await db
            .select({ snapshot: pageSnapshots.snapshot })
            .from(pageSnapshots)
            .where(eq(pageSnapshots.pageId, documentName))
            .orderBy(desc(pageSnapshots.createdAt))
            .limit(1);

          if (snapshot?.snapshot) {
            return Buffer.from(snapshot.snapshot, 'base64');
          }

          // 2. Legacy fallback: yjsSnapshot embedded in blocks.content JSONB
          const [block] = await db
            .select({ content: blocks.content })
            .from(blocks)
            .where(eq(blocks.id, documentName))
            .limit(1);

          if (block?.content) {
            const data = block.content as Record<string, unknown>;
            const yjsSnapshot = data['yjsSnapshot'];
            if (typeof yjsSnapshot === 'string') {
              return Buffer.from(yjsSnapshot, 'base64');
            }
          }

          return null;
        },

        /**
         * Persist the current Y.Doc state.
         *
         * Two writes per call:
         *   1. Update blocks.content.yjsSnapshot (hot path — fast reads)
         *   2. Every hour, insert a pageSnapshots row for version history
         */
        store: async ({
          documentName,
          state,
          document,
        }: {
          documentName: string;
          state: Uint8Array;
          document: Y.Doc;
        }) => {
          const base64 = Buffer.from(state).toString('base64');

          // 1. Update live snapshot in blocks.content
          const [existing] = await db
            .select({ content: blocks.content, properties: blocks.properties })
            .from(blocks)
            .where(eq(blocks.id, documentName))
            .limit(1);

          if (existing) {
            const content = (existing.content as Record<string, unknown>) ?? {};
            await db
              .update(blocks)
              .set({
                content: { ...content, yjsSnapshot: base64 } as Record<string, unknown>,
              })
              .where(eq(blocks.id, documentName));
          }

          // 3. Update search index for the page and its child blocks (best-effort)
          if (existing) {
            try {
              const props = (existing.properties as Record<string, unknown>) ?? {};
              const title = typeof props['title'] === 'string' ? props['title'] : 'Untitled';

              // Fetch all child blocks for this page to index their text content
              const childBlocks = await db
                .select({
                  id: blocks.id,
                  type: blocks.type,
                  workspaceId: blocks.workspaceId,
                  pageId: blocks.pageId,
                  properties: blocks.properties,
                  content: blocks.content,
                })
                .from(blocks)
                .where(eq(blocks.pageId, documentName));

              const pageBlock = childBlocks.find((b) => b.id === documentName);
              const workspaceId = pageBlock?.workspaceId ?? childBlocks[0]?.workspaceId ?? '';

              onPageUpdated(
                {
                  id: documentName,
                  title,
                  topic: null,
                  workspaceId,
                  archived: false,
                  createdBy: 'system',
                },
                childBlocks.map((b) => {
                  const bProps = (b.properties as Record<string, unknown>) ?? {};
                  const bContent = (b.content as Record<string, unknown>) ?? {};
                  const text =
                    typeof bProps['text'] === 'string'
                      ? bProps['text']
                      : typeof bContent['text'] === 'string'
                        ? bContent['text']
                        : typeof bProps['title'] === 'string'
                          ? bProps['title']
                          : '';
                  return {
                    id: b.id,
                    text,
                    type: b.type,
                    workspaceId: b.workspaceId,
                    pageId: b.pageId,
                  };
                })
              );
            } catch (indexErr) {
              console.warn('[hocuspocus] Search indexing failed:', indexErr);
            }
          }

          // 2. Hourly versioned snapshot
          const now = Date.now();
          const lastTime = lastSnapshotTime.get(documentName) ?? 0;

          if (now - lastTime > ONE_HOUR) {
            try {
              const title =
                ((existing?.properties as Record<string, unknown>)?.['title'] as string) ??
                'Untitled';

              // Encode the full document state (not just the incremental update)
              const fullUpdate = Y.encodeStateAsUpdate(document);
              const snapshotBase64 = Buffer.from(fullUpdate).toString('base64');

              await db.insert(pageSnapshots).values({
                pageId: documentName,
                title,
                snapshot: snapshotBase64,
                // TODO: thread the authenticated userId through to here via
                // context/connection data once Hocuspocus context passing is wired up.
                createdBy: 'system',
              });

              lastSnapshotTime.set(documentName, now);
            } catch (err) {
              // Non-fatal — log and continue so the live edit is never blocked
              console.warn(
                `[hocuspocus] Auto-snapshot failed for ${documentName}:`,
                err,
              );
            }
          }
        },
      }),
    ],

    async onDisconnect({ documentName }: { documentName: string }) {
      console.info(`[hocuspocus] User disconnected from ${documentName}`);
    },
  });
}
