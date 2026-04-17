/**
 * seed-notion-demo.ts
 *
 * Populates the dev database with a rich Notion-style demo:
 *   - 1 workspace ("Notion Demo")
 *   - 5 human users (alice, bob, carol, dave, ellen)
 *   - 1 channel (#general) with all 5 members
 *   - ~10 messages spanning the last 7 days
 *   - 3 Notion pages (Welcome, Project Roadmap with sub-pages, Articles Database)
 *   - Favorites, page permissions, share link, block comments, canvases
 *
 * Idempotent: deletes the "Notion Demo" workspace (CASCADE) before re-creating.
 *
 * Usage:
 *   cd slack && npm run seed:notion
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  pgTable, uuid, text, boolean, timestamp, integer, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { randomBytes } from 'crypto';

// ─── Local Drizzle table defs for Notion tables not yet in schema.ts ─────────
// These mirror 0010_notion_core.sql exactly so tsc resolves column names.

export type BlockType =
  | 'page' | 'text' | 'heading_1' | 'heading_2' | 'heading_3'
  | 'bulleted_list' | 'numbered_list' | 'to_do' | 'toggle' | 'callout'
  | 'code' | 'divider' | 'image' | 'quote' | 'table' | 'bookmark'
  | 'file' | 'embed' | 'database';

export type ViewType = 'table' | 'board' | 'list' | 'calendar' | 'gallery' | 'timeline';
export type PermissionLevel = 'full_access' | 'can_edit' | 'can_comment' | 'can_view';

const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').$type<BlockType>().notNull(),
    parentId: uuid('parent_id'),
    pageId: uuid('page_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().default({}).notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().default({}).notNull(),
    childrenOrder: jsonb('children_order').$type<string[]>().default([]).notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archived: boolean('archived').default(false).notNull(),
  },
  (t) => [
    index('blocks_page_parent_idx').on(t.pageId, t.parentId),
    index('blocks_workspace_type_idx').on(t.workspaceId, t.type),
    index('blocks_parent_idx').on(t.parentId),
  ]
);

const databaseViews = pgTable(
  'database_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    databaseId: uuid('database_id').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<ViewType>().default('table').notNull(),
    filters: jsonb('filters')
      .$type<{ logic: 'and' | 'or'; conditions: unknown[] }>()
      .default({ logic: 'and', conditions: [] })
      .notNull(),
    sorts: jsonb('sorts').$type<unknown[]>().default([]).notNull(),
    groupBy: jsonb('group_by'),
    config: jsonb('config')
      .$type<{ visibleProperties?: string[] }>()
      .default({ visibleProperties: [] })
      .notNull(),
    position: integer('position').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('database_views_db_pos_idx').on(t.databaseId, t.position)]
);

const blockComments = pgTable(
  'block_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: uuid('block_id').notNull(),
    authorId: uuid('author_id').notNull(),
    content: jsonb('content').notNull(),
    resolved: boolean('resolved').default(false).notNull(),
    threadId: uuid('thread_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('block_comments_block_idx').on(t.blockId)]
);

const pagePermissions = pgTable(
  'page_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id').notNull(),
    userId: uuid('user_id').notNull(),
    level: text('level').$type<PermissionLevel>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('page_permissions_page_user_unique').on(t.pageId, t.userId),
    index('page_permissions_page_idx').on(t.pageId),
  ]
);

// ─── DB setup ────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: POSTGRES_URL or DATABASE_URL env var is required.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // ── 0. Idempotency: delete existing "Notion Demo" workspace (CASCADE) ──────
  const [existing] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.name, 'Notion Demo'))
    .limit(1);

  if (existing) {
    console.log('Deleting existing "Notion Demo" workspace and all cascaded data…');
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, existing.id));
  }

  // Clean up seed users by ain_address (no workspace FK on users, so do separately).
  const seedAddresses = [
    'notion-demo:alice',
    'notion-demo:bob',
    'notion-demo:carol',
    'notion-demo:dave',
    'notion-demo:ellen',
  ];
  for (const addr of seedAddresses) {
    await db.delete(schema.users).where(eq(schema.users.ainAddress, addr));
  }

  // ── 1. Workspace ──────────────────────────────────────────────────────────
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name: 'Notion Demo', iconText: 'ND', description: 'Rich Notion demo workspace' })
    .returning();

  // ── 2. Users ──────────────────────────────────────────────────────────────
  const userDefs = [
    { ainAddress: 'notion-demo:alice', displayName: 'Alice Chen'     },
    { ainAddress: 'notion-demo:bob',   displayName: 'Bob Nakamura'   },
    { ainAddress: 'notion-demo:carol', displayName: 'Carol Smith'    },
    { ainAddress: 'notion-demo:dave',  displayName: 'Dave Okonkwo'   },
    { ainAddress: 'notion-demo:ellen', displayName: 'Ellen Vasquez'  },
  ];

  const insertedUsers = await db
    .insert(schema.users)
    .values(userDefs.map(u => ({ ...u, status: 'online' as const })))
    .returning();

  const alice = insertedUsers[0];
  const bob   = insertedUsers[1];
  const carol = insertedUsers[2];
  const dave  = insertedUsers[3];
  // const ellen = insertedUsers[4]; // member only — no special role needed below

  // ── 3. Workspace members ──────────────────────────────────────────────────
  await db.insert(schema.workspaceMembers).values(
    insertedUsers.map((u, i) => ({
      workspaceId: workspace.id,
      userId: u.id,
      role: i === 0 ? 'admin' : 'member',
    }))
  );

  // ── 4. Channel #general ───────────────────────────────────────────────────
  const [channel] = await db
    .insert(schema.channels)
    .values({
      name: 'general',
      description: 'General discussion',
      workspaceId: workspace.id,
      createdBy: alice.id,
    })
    .returning();

  await db.insert(schema.channelMembers).values(
    insertedUsers.map((u, i) => ({
      channelId: channel.id,
      userId: u.id,
      role: i === 0 ? 'admin' : 'member',
    }))
  );

  // ── 5. Messages (~10 over last 7 days) ────────────────────────────────────
  const messageDefs = [
    { userId: alice.id,            content: 'Welcome everyone to the Notion Demo workspace! 🎉',                       daysBack: 7 },
    { userId: bob.id,              content: 'Thanks Alice! Excited to explore the block-based editor.',               daysBack: 7 },
    { userId: carol.id,            content: 'I just created the Project Roadmap page — check it out.',               daysBack: 6 },
    { userId: dave.id,             content: 'The code block rendering looks great. JavaScript syntax works perfectly.', daysBack: 5 },
    { userId: insertedUsers[4].id, content: 'Can someone grant me edit access to the roadmap? @carol',               daysBack: 5 },
    { userId: alice.id,            content: "I've set up favorites for the Welcome page and Articles Database.",      daysBack: 4 },
    { userId: bob.id,              content: 'Published the first article — moved it to "published" status.',         daysBack: 3 },
    { userId: carol.id,            content: 'Added Q2 and Q3 sub-pages under Project Roadmap.',                      daysBack: 2 },
    { userId: dave.id,             content: 'Left a comment on the intro paragraph in Welcome to Notion.',           daysBack: 1 },
    { userId: insertedUsers[4].id, content: 'Shared the Welcome page publicly via share link.',                      daysBack: 0 },
  ];

  const insertedMessages: string[] = [];
  for (const m of messageDefs) {
    const createdAt = daysAgo(m.daysBack);
    const [msg] = await db
      .insert(schema.messages)
      .values({ channelId: channel.id, userId: m.userId, content: m.content, createdAt })
      .returning({ id: schema.messages.id });
    insertedMessages.push(msg.id);
  }

  // ── 6. Notion pages (blocks table) ────────────────────────────────────────
  //
  // Pattern (from migrate-canvas-to-blocks.ts and pages/route.ts):
  //   1. Insert page block with placeholder pageId
  //   2. UPDATE to set pageId = id (self-reference)
  //   3. Insert child blocks with parentId = page.id, pageId = page.id
  //   4. UPDATE page's childrenOrder

  const PLACEHOLDER_PAGE_ID = '00000000-0000-0000-0000-000000000000';

  // ── 6a. "Welcome to Notion" page ─────────────────────────────────────────
  type ChildDef = {
    type: BlockType;
    content: Record<string, unknown>;
    properties?: Record<string, unknown>;
  };

  const welcomePage = await db.transaction(async (tx) => {
    const [page] = await tx
      .insert(blocks)
      .values({
        type: 'page',
        parentId: null,
        pageId: PLACEHOLDER_PAGE_ID,
        workspaceId: workspace.id,
        properties: { title: 'Welcome to Notion', icon: '👋' },
        content: {},
        childrenOrder: [],
        createdBy: alice.id,
      })
      .returning();

    await tx.update(blocks).set({ pageId: page.id }).where(eq(blocks.id, page.id));

    const childDefs: ChildDef[] = [
      { type: 'heading_1', content: { text: 'Welcome to Notion' } },
      {
        type: 'text',
        content: {
          text: 'Notion is an all-in-one workspace where you can write, plan, and collaborate. Every piece of content is a block — from headings and paragraphs to code snippets and to-do items. This page demonstrates the full range of block types available in this implementation.',
        },
      },
      { type: 'heading_2', content: { text: 'Features' } },
      { type: 'bulleted_list', content: { text: 'Rich block-based editing with real-time collaboration' } },
      { type: 'bulleted_list', content: { text: 'Nested pages, databases, and multiple view types' } },
      { type: 'bulleted_list', content: { text: 'Granular permissions: full_access, can_edit, can_comment, can_view' } },
      { type: 'heading_2', content: { text: 'Code example' } },
      {
        type: 'code',
        content: {
          language: 'javascript',
          text: [
            '// Fetch a Notion page via the API',
            'const res = await fetch(`/api/pages/${pageId}`);',
            'const page = await res.json();',
            '',
            '// Insert a new block as a child',
            'await fetch(`/api/pages/${pageId}/blocks`, {',
            "  method: 'POST',",
            "  body: JSON.stringify({ type: 'text', content: { text: 'Hello, block!' } }),",
            '});',
          ].join('\n'),
        },
      },
      { type: 'heading_2', content: { text: 'Tasks' } },
      { type: 'to_do', content: { text: 'Set up workspace and invite team members' },    properties: { checked: true  } },
      { type: 'to_do', content: { text: 'Create pages for Q2 and Q3 roadmap' },          properties: { checked: false } },
      { type: 'to_do', content: { text: 'Publish first article from Articles Database' }, properties: { checked: false } },
      {
        type: 'callout',
        content: {
          text: 'Tip: Use the / command menu to insert any block type, or drag blocks to reorder them.',
          icon: '💡',
        },
      },
      { type: 'divider', content: {} },
      { type: 'quote',   content: { text: '"The art of writing is the art of discovering what you believe." — Gustave Flaubert' } },
      {
        type: 'bookmark',
        content: { url: 'https://anthropic.com', title: 'Anthropic', description: 'AI safety and research company' },
      },
    ];

    const childIds: string[] = [];
    for (const d of childDefs) {
      const [child] = await tx
        .insert(blocks)
        .values({
          type: d.type,
          parentId: page.id,
          pageId: page.id,
          workspaceId: workspace.id,
          properties: d.properties ?? {},
          content: d.content,
          childrenOrder: [],
          createdBy: alice.id,
        })
        .returning({ id: blocks.id });
      childIds.push(child.id);
    }

    await tx.update(blocks).set({ childrenOrder: childIds }).where(eq(blocks.id, page.id));

    return { id: page.id, childIds };
  });

  // The second child block (index 1) is the text paragraph — used for comments
  const welcomeTextBlockId = welcomePage.childIds[1];

  // ── 6b. "Project Roadmap" page + sub-pages ───────────────────────────────
  const roadmapPage = await db.transaction(async (tx) => {
    const [page] = await tx
      .insert(blocks)
      .values({
        type: 'page',
        parentId: null,
        pageId: PLACEHOLDER_PAGE_ID,
        workspaceId: workspace.id,
        properties: { title: 'Project Roadmap', icon: '🗺️' },
        content: {},
        childrenOrder: [],
        createdBy: bob.id,
        createdAt: daysAgo(6),
      })
      .returning();

    await tx.update(blocks).set({ pageId: page.id }).where(eq(blocks.id, page.id));

    const subPageDefs = [
      {
        title: 'Q2 Goals',
        icon: '🎯',
        body: 'Focus areas: ship the Notion block editor, migrate 50+ canvases, enable public share links.',
      },
      {
        title: 'Q3 Plans',
        icon: '📅',
        body: 'Focus areas: database views (board, calendar), AI summarization, mobile-responsive editor.',
      },
    ];

    const childIds: string[] = [];
    for (const sp of subPageDefs) {
      const [subPage] = await tx
        .insert(blocks)
        .values({
          type: 'page',
          parentId: page.id,
          pageId: PLACEHOLDER_PAGE_ID,
          workspaceId: workspace.id,
          properties: { title: sp.title, icon: sp.icon },
          content: {},
          childrenOrder: [],
          createdBy: bob.id,
        })
        .returning();

      await tx.update(blocks).set({ pageId: subPage.id }).where(eq(blocks.id, subPage.id));

      const [textBlock] = await tx
        .insert(blocks)
        .values({
          type: 'text',
          parentId: subPage.id,
          pageId: subPage.id,
          workspaceId: workspace.id,
          properties: {},
          content: { text: sp.body },
          childrenOrder: [],
          createdBy: bob.id,
        })
        .returning({ id: blocks.id });

      await tx
        .update(blocks)
        .set({ childrenOrder: [textBlock.id] })
        .where(eq(blocks.id, subPage.id));

      childIds.push(subPage.id);
    }

    await tx.update(blocks).set({ childrenOrder: childIds }).where(eq(blocks.id, page.id));

    return { id: page.id };
  });

  // ── 6c. "Articles Database" — type='database' with 3 row-pages ───────────
  const articlesDb = await db.transaction(async (tx) => {
    const [dbBlock] = await tx
      .insert(blocks)
      .values({
        type: 'database',
        parentId: null,
        pageId: PLACEHOLDER_PAGE_ID,
        workspaceId: workspace.id,
        properties: {
          title: 'Articles Database',
          icon: '📚',
          schema: {
            Status: { type: 'select', options: ['draft', 'edited', 'published'] },
            Author: { type: 'person' },
          },
        },
        content: {},
        childrenOrder: [],
        createdBy: alice.id,
        createdAt: daysAgo(5),
      })
      .returning();

    await tx.update(blocks).set({ pageId: dbBlock.id }).where(eq(blocks.id, dbBlock.id));

    const rowDefs = [
      { title: 'Introduction to Block-Based Editing', status: 'draft',     author: alice.displayName },
      { title: 'How Real-Time Collaboration Works',   status: 'draft',     author: bob.displayName   },
      { title: 'Notion API: A Complete Guide',         status: 'published', author: carol.displayName },
    ];

    const rowIds: string[] = [];
    for (const row of rowDefs) {
      const [rowPage] = await tx
        .insert(blocks)
        .values({
          type: 'page',
          parentId: dbBlock.id,
          pageId: PLACEHOLDER_PAGE_ID,
          workspaceId: workspace.id,
          properties: {
            title: row.title,
            Status: row.status,
            Author: row.author,
          },
          content: {},
          childrenOrder: [],
          createdBy: alice.id,
        })
        .returning();

      await tx.update(blocks).set({ pageId: rowPage.id }).where(eq(blocks.id, rowPage.id));
      rowIds.push(rowPage.id);
    }

    await tx.update(blocks).set({ childrenOrder: rowIds }).where(eq(blocks.id, dbBlock.id));

    // DatabaseView: "By Status" board view
    await tx.insert(databaseViews).values({
      databaseId: dbBlock.id,
      name: 'By Status',
      type: 'board',
      groupBy: { property: 'Status' },
      filters: { logic: 'and', conditions: [] },
      sorts: [],
      config: { visibleProperties: ['Status', 'Author'] },
      position: 0,
    });

    return { id: dbBlock.id };
  });

  // ── 7. Favorites — alice favorites Welcome + Articles Database ────────────
  // `favorites` table not yet in Drizzle schema — use raw SQL
  await db.execute(
    sql`INSERT INTO favorites (user_id, workspace_id, page_id, position)
        VALUES
          (${alice.id}, ${workspace.id}, ${welcomePage.id}, 0),
          (${alice.id}, ${workspace.id}, ${articlesDb.id},  1)
        ON CONFLICT (user_id, page_id) DO NOTHING`
  );

  // ── 8. Page permissions on "Project Roadmap" ─────────────────────────────
  await db.insert(pagePermissions).values([
    { pageId: roadmapPage.id, userId: bob.id,   level: 'full_access' },
    { pageId: roadmapPage.id, userId: carol.id, level: 'can_edit'    },
    { pageId: roadmapPage.id, userId: dave.id,  level: 'can_view'    },
  ]);

  // ── 9. Share link on "Welcome to Notion" (public, expires in 30 days) ────
  // `share_links` not yet in Drizzle schema — use raw SQL
  const shareToken = randomBytes(24).toString('hex');
  const shareExpiresAt = new Date(Date.now() + 30 * 24 * 3_600_000);
  await db.execute(
    sql`INSERT INTO share_links (page_id, token, level, is_public, expires_at)
        VALUES (${welcomePage.id}, ${shareToken}, 'can_view', true, ${shareExpiresAt})`
  );

  // ── 10. Block comments on the text paragraph in "Welcome" ─────────────────
  await db.insert(blockComments).values([
    {
      blockId:  welcomeTextBlockId,
      authorId: carol.id,
      content:  { text: 'Great intro paragraph! Maybe add a link to the docs?' },
      resolved: false,
      createdAt: hoursAgo(36),
    },
    {
      blockId:  welcomeTextBlockId,
      authorId: dave.id,
      content:  { text: '+1 — also worth mentioning the offline mode.' },
      resolved: false,
      createdAt: hoursAgo(12),
    },
  ]);

  // ── 11. Canvases: 2 legacy canvases in #general ───────────────────────────
  // Canvas 1: bridged — points to Welcome page (page_id column added via migration)
  await db.execute(
    sql`INSERT INTO canvases (workspace_id, channel_id, title, content, created_by, page_id)
        VALUES (
          ${workspace.id},
          ${channel.id},
          'Welcome Canvas (bridged)',
          '',
          ${alice.id},
          ${welcomePage.id}
        )`
  );

  // Canvas 2: legacy markdown only (no page_id — the un-migrated case)
  await db
    .insert(schema.canvases)
    .values({
      workspaceId: workspace.id,
      channelId: channel.id,
      title: 'Meeting Notes (legacy markdown)',
      content: [
        '# Team Sync — Week 1',
        '',
        '## Agenda',
        '- Review Notion block editor progress',
        '- Assign owners for Q2 Goals page',
        '- Demo the Articles Database board view',
        '',
        '## Action Items',
        '- [ ] Alice: publish share link for Welcome page',
        '- [x] Bob: create Project Roadmap with sub-pages',
        '- [ ] Carol: review editorial permissions',
      ].join('\n'),
      createdBy: alice.id,
    });

  // ── Summary ───────────────────────────────────────────────────────────────
  const blockCountRows = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM blocks WHERE workspace_id = ${workspace.id}`
  );
  const msgCountRows = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM messages WHERE channel_id = ${channel.id}`
  );
  const pageCountRows = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM blocks
        WHERE workspace_id = ${workspace.id}
          AND type IN ('page', 'database')
          AND parent_id IS NULL`
  );

  // drizzle execute() returns rows as the result directly
  const blockCount = (blockCountRows as unknown as Array<{ n: number }>)[0]?.n ?? 0;
  const msgCount   = (msgCountRows   as unknown as Array<{ n: number }>)[0]?.n ?? 0;
  const pageCount  = (pageCountRows  as unknown as Array<{ n: number }>)[0]?.n ?? 0;

  console.log('\n=== Notion Demo Seed Complete ===\n');
  console.log('Workspace :', workspace.name);
  console.log('Users     :', insertedUsers.map(u => u.displayName).join(', '));
  console.log('Channel   : #general');
  console.log('Messages  :', msgCount);
  console.log('Pages     :', pageCount, ' (top-level — Welcome, Roadmap, Articles Database)');
  console.log('Blocks    :', blockCount, '(all blocks including children)');
  console.log('');
  console.log('Share URL :', `http://localhost:3000/share/${shareToken}`);
  console.log('Workspace :', `http://localhost:3000/workspace/${workspace.id}`);
  console.log('');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
