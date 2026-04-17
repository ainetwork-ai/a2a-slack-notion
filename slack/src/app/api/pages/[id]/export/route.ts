/**
 * GET /api/pages/:id/export?format=md
 *
 * Exports a Notion page as GitHub-flavored Markdown.
 *
 * Query params:
 *   format=md   (default) — returns text/markdown attachment
 *   format=html — not yet implemented (501)
 *
 * Auth: requires a valid session + view access to the page
 *   (explicit pagePermission row OR workspace membership).
 *
 * Note: page access is checked inline here rather than via page-access.ts
 * because that helper imports `blocks` from @/lib/db/schema which has not yet
 * been added to the shared schema export.
 */

import { db } from '@/lib/db';
import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { workspaceMembers } from '@/lib/db/schema';
import { collectPageTree } from '@/lib/notion/export/collect-tree';
import { blocksToMarkdown } from '@/lib/notion/export/blocks-to-markdown';
import { NextRequest, NextResponse } from 'next/server';

// ── Inline table definitions (blocks + pagePermissions not yet in schema.ts) ─

const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
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
});

const pagePermissions = pgTable('page_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull(),
  userId: uuid('user_id').notNull(),
  level: text('level').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

type PageRow = typeof blocks.$inferSelect;

async function getPage(id: string): Promise<PageRow | null> {
  const [page] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!page || page.type !== 'page') return null;
  return page;
}

async function canViewPage(userId: string, page: PageRow): Promise<boolean> {
  const [perm] = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, page.id), eq(pagePermissions.userId, userId)))
    .limit(1);

  if (perm) return true;

  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, page.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'md';

  // TODO: implement HTML export
  if (format === 'html') {
    return NextResponse.json(
      { error: 'HTML export is not yet implemented.' },
      { status: 501 },
    );
  }

  if (format !== 'md') {
    return NextResponse.json(
      { error: `Unsupported format: ${format}. Use format=md.` },
      { status: 400 },
    );
  }

  // Load + authorise page
  const page = await getPage(id);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  if (!(await canViewPage(auth.user.id, page))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch full block tree
  let tree;
  try {
    tree = await collectPageTree(id);
  } catch {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Serialise to Markdown
  const markdown = blocksToMarkdown(tree.page, tree.blocks);

  // Safe filename from page title
  const props = page.properties as Record<string, unknown>;
  const rawTitle = typeof props.title === 'string' ? props.title : 'export';

  const safeFilename = rawTitle
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100) || 'export';

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFilename}.md"`,
    },
  });
}
