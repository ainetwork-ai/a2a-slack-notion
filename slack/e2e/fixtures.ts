/**
 * Shared Playwright fixtures for Notion integration E2E tests.
 *
 * Strategy:
 *   - Prefer direct DB writes (drizzle) for speed and determinism.
 *   - Session injection: slack uses iron-session with cookie name `slack-a2a-session`.
 *     We sign a session blob with the same SESSION_SECRET and inject via
 *     page.context().addCookies([...]).
 *   - Each test creates its own workspace (unique suffix) and deletes on teardown.
 *
 * TODO (non-blocking):
 *   - `@/lib/db` path alias resolves via the Next.js tsconfig plugin; Playwright runs its
 *     own ts-node pipeline. We use the relative path `../src/lib/db` here. If the bundler
 *     still complains, fall back to REST-seeded fixtures (see `seedViaRest` below).
 *   - iron-session's `sealData()` is async and depends on `SESSION_SECRET`. If that env
 *     var is not loaded at test time, the seal will still succeed with the default dev
 *     secret, which matches `slack/src/lib/auth/session.ts`. In CI we recommend
 *     exporting the exact same SESSION_SECRET used by `pnpm dev`.
 */

import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { sealData } from "iron-session";
import { randomBytes, randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TestUser {
  id: string;
  ainAddress: string;
  displayName: string;
}

export interface TestWorkspace {
  id: string;
  name: string;
  ownerId: string;
}

export interface TestCanvas {
  id: string;       // canvases.id
  pageId: string;   // blocks.id where type='page' (bridge via canvases.page_id)
  title: string;
  workspaceId: string;
}

export interface TestSeed {
  user: TestUser;
  workspace: TestWorkspace;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

const SESSION_COOKIE_NAME = "slack-a2a-session";
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? "dev-secret-change-in-production-32ch";

/**
 * Builds a sealed iron-session cookie identical to what `slack/src/lib/auth/session.ts`
 * reads on the server. Inject the returned value into `page.context().addCookies(...)`.
 */
export async function buildSessionCookie(
  userId: string,
  opts: { ainAddress?: string } = {},
): Promise<{ name: string; value: string; domain: string; path: string }> {
  const value = await sealData(
    { userId, ainAddress: opts.ainAddress },
    { password: SESSION_SECRET, ttl: 0 },
  );
  return {
    name: SESSION_COOKIE_NAME,
    value,
    domain: "localhost",
    path: "/",
  };
}

export async function loginAs(context: BrowserContext, user: TestUser): Promise<void> {
  const cookie = await buildSessionCookie(user.id, { ainAddress: user.ainAddress });
  await context.addCookies([cookie]);
}

// ─── DB-backed seeders ────────────────────────────────────────────────────────
//
// These are thin wrappers so tests read cleanly; they isolate the drizzle import
// in one place. If @/lib/db cannot resolve in the Playwright runtime, switch to
// `seedViaRest` (below) without touching the callers.

type DbModule = typeof import("../src/lib/db");
type SchemaModule = typeof import("../src/lib/db/schema");

let _dbCache: { db: DbModule["db"]; schema: SchemaModule } | null = null;

async function getDb(): Promise<{ db: DbModule["db"]; schema: SchemaModule }> {
  if (_dbCache) return _dbCache;
  // Relative import — Playwright does not honor the @/* alias in the slack tsconfig.
  const [{ db }, schema] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/db/schema"),
  ]);
  _dbCache = { db, schema };
  return _dbCache;
}

function suffix(): string {
  return `${Date.now()}-${randomBytes(3).toString("hex")}`;
}

export async function createTestUser(
  overrides: Partial<Pick<TestUser, "displayName" | "ainAddress">> = {},
): Promise<TestUser> {
  const { db, schema } = await getDb();
  const ainAddress = overrides.ainAddress ?? `0xE2E${randomBytes(18).toString("hex")}`;
  const displayName = overrides.displayName ?? `E2E User ${suffix()}`;
  const [row] = await db
    .insert(schema.users)
    .values({ ainAddress, displayName })
    .returning({ id: schema.users.id });
  return { id: row.id, ainAddress, displayName };
}

export async function createTestWorkspace(ownerId: string, name?: string): Promise<TestWorkspace> {
  const { db, schema } = await getDb();
  const workspaceName = name ?? `e2e-ws-${suffix()}`;
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: workspaceName, createdBy: ownerId })
    .returning({ id: schema.workspaces.id, name: schema.workspaces.name });
  await db
    .insert(schema.workspaceMembers)
    .values({ workspaceId: ws.id, userId: ownerId, role: "owner" });
  return { id: ws.id, name: ws.name, ownerId };
}

/**
 * Creates a canvas + bridging page block. Matches the cutover schema where
 * `canvases.page_id` points at a `blocks` row with `type='page'`.
 */
export async function createCanvas(
  workspaceId: string,
  createdBy: string,
  opts: { title?: string; channelId?: string } = {},
): Promise<TestCanvas> {
  const { db, schema } = await getDb();
  const title = opts.title ?? `E2E Canvas ${suffix()}`;

  // Create bridging page block first so canvas.page_id is non-null.
  const placeholder = "00000000-0000-0000-0000-000000000000";
  const [pageRow] = await db
    .insert(schema.blocks)
    .values({
      type: "page",
      parentId: null,
      pageId: placeholder,
      workspaceId,
      properties: { title },
      content: {},
      childrenOrder: [],
      createdBy,
    })
    .returning({ id: schema.blocks.id });

  // Self-reference to make the block its own pageId (matches POST /api/pages).
  const { eq } = await import("drizzle-orm");
  await db.update(schema.blocks).set({ pageId: pageRow.id }).where(eq(schema.blocks.id, pageRow.id));

  const [canvasRow] = await db
    .insert(schema.canvases)
    .values({
      id: randomUUID(),
      channelId: opts.channelId ?? null,
      workspaceId,
      title,
      content: "",
      createdBy,
      pageId: pageRow.id,
    })
    .returning({ id: schema.canvases.id });

  return { id: canvasRow.id, pageId: pageRow.id, title, workspaceId };
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const { db, schema } = await getDb();
  const { eq } = await import("drizzle-orm");
  // ON DELETE CASCADE handles workspaceMembers, channels, canvases, blocks (via workspaceId FK).
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
}

export async function deleteUser(userId: string): Promise<void> {
  const { db, schema } = await getDb();
  const { eq } = await import("drizzle-orm");
  await db.delete(schema.users).where(eq(schema.users.id, userId));
}

// ─── REST-only fallback (if DB import breaks) ─────────────────────────────────
//
// Only use this path when drizzle can't be loaded from the Playwright runtime.
// It assumes the dev server is already running with an existing admin session
// token exposed via `E2E_ADMIN_COOKIE` (mint via `pnpm tsx scripts/mint-e2e-admin.ts`).

export async function seedViaRest(
  page: Page,
  opts: { workspaceName?: string } = {},
): Promise<TestSeed> {
  const cookie = process.env.E2E_ADMIN_COOKIE;
  if (!cookie) {
    throw new Error(
      "seedViaRest requires E2E_ADMIN_COOKIE. Run scripts/mint-e2e-admin.ts first or use DB seeders.",
    );
  }
  // TODO: implement once the admin-only seed endpoints land.
  throw new Error("seedViaRest not implemented — DB path is preferred while available");
}

// ─── Extended test fixtures ───────────────────────────────────────────────────

export const test = base.extend<{
  seed: TestSeed;
  authedPage: Page;
}>({
  seed: async ({}, use) => {
    const user = await createTestUser();
    const workspace = await createTestWorkspace(user.id);
    await use({ user, workspace });
    // Teardown — workspace cascades blocks/canvases; user is separate.
    try {
      await deleteWorkspace(workspace.id);
    } catch {
      /* ignore cleanup errors */
    }
    try {
      await deleteUser(user.id);
    } catch {
      /* ignore cleanup errors */
    }
  },
  authedPage: async ({ page, seed }, use) => {
    await loginAs(page.context(), seed.user);
    await use(page);
  },
});

export { expect };
