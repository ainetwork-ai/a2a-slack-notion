import { and, eq } from 'drizzle-orm';
import { db } from './db';
import {
  pagePermissions,
  blocks,
  workspaceMembers,
} from '@/lib/db/schema';

type PermLevel = 'full_access' | 'can_edit' | 'can_comment' | 'can_view';

const LEVEL_HIERARCHY: Record<PermLevel, number> = {
  full_access: 4,
  can_edit: 3,
  can_comment: 2,
  can_view: 1,
};

/**
 * Check if a user has at least the required permission level on a page.
 */
export async function checkPagePermission(
  userId: string,
  pageId: string,
  required: PermLevel,
): Promise<boolean> {
  // Demo mode: anyone authenticated can view any page. Write levels still gated below.
  if (required === 'can_view') {
    return true;
  }

  // 1. Check explicit permission on this page
  const explicit = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)))
    .limit(1)
    .then((r) => r[0]);

  if (explicit) {
    return LEVEL_HIERARCHY[explicit.level as PermLevel] >= LEVEL_HIERARCHY[required];
  }

  // 2. Walk up parent chain (inheritance)
  const page = await db
    .select({ parentId: blocks.parentId, workspaceId: blocks.workspaceId })
    .from(blocks)
    .where(eq(blocks.id, pageId))
    .limit(1)
    .then((r) => r[0]);

  if (!page) return false;

  let currentPageId: string | null = page.parentId;
  let depth = 0;
  while (currentPageId && depth < 20) {
    const parentPerm = await db
      .select()
      .from(pagePermissions)
      .where(and(eq(pagePermissions.pageId, currentPageId), eq(pagePermissions.userId, userId)))
      .limit(1)
      .then((r) => r[0]);

    if (parentPerm) {
      return LEVEL_HIERARCHY[parentPerm.level as PermLevel] >= LEVEL_HIERARCHY[required];
    }

    const parent = await db
      .select({ parentId: blocks.parentId })
      .from(blocks)
      .where(eq(blocks.id, currentPageId))
      .limit(1)
      .then((r) => r[0]);

    currentPageId = parent?.parentId ?? null;
    depth++;
  }

  // 3. Workspace role fallback
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, page.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!member) return false;

  if (member.role === 'admin' || member.role === 'member') return true;
  if (member.role === 'guest') return LEVEL_HIERARCHY['can_view'] >= LEVEL_HIERARCHY[required];

  return false;
}

/**
 * Get the effective permission level for a user on a page.
 */
export async function getPagePermissionLevel(
  userId: string,
  pageId: string,
): Promise<PermLevel | null> {
  const explicit = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)))
    .limit(1)
    .then((r) => r[0]);
  if (explicit) return explicit.level as PermLevel;

  const page = await db
    .select({ parentId: blocks.parentId, workspaceId: blocks.workspaceId })
    .from(blocks)
    .where(eq(blocks.id, pageId))
    .limit(1)
    .then((r) => r[0]);
  if (!page) return null;

  if (page.parentId) {
    const parentPerm = await db
      .select()
      .from(pagePermissions)
      .where(and(eq(pagePermissions.pageId, page.parentId), eq(pagePermissions.userId, userId)))
      .limit(1)
      .then((r) => r[0]);
    if (parentPerm) return parentPerm.level as PermLevel;
  }

  const member = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, page.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1)
    .then((r) => r[0]);
  if (!member) return null;
  if (member.role === 'admin' || member.role === 'member') return 'full_access';
  return 'can_view';
}

/**
 * Helper: require a permission. Returns a NextResponse on failure, or null on success.
 */
export async function requirePermission(
  userId: string,
  pageId: string,
  level: PermLevel,
): Promise<string | null> {
  const allowed = await checkPagePermission(userId, pageId, level);
  if (!allowed) {
    return `Insufficient permission. Required: ${level}`;
  }
  return null;
}
