/**
 * Shared page-access helpers used by page sub-resource routes
 * (permissions, snapshots, share-links, comments).
 */

import { db } from '@/lib/db';
import { blocks, pagePermissions, workspaceMembers } from '@/lib/db/schema';
import type { PermissionLevel } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export type PageRow = typeof blocks.$inferSelect;

/** Fetch a page block; returns null when not found or not of type 'page'. */
export async function getPage(id: string): Promise<PageRow | null> {
  const [page] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!page || page.type !== 'page') return null;
  return page;
}

/**
 * Returns true when `userId` can access `page` at the requested level.
 * - 'view'  → any explicit permission OR workspace membership
 * - 'edit'  → full_access | can_edit permission OR workspace membership
 * - 'comment' → full_access | can_edit | can_comment OR workspace membership
 * - 'full_access' → only explicit full_access permission (no workspace fallback)
 */
export async function canAccess(
  userId: string,
  page: PageRow,
  level: 'view' | 'comment' | 'edit' | 'full_access' = 'view',
): Promise<boolean> {
  const [perm] = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, page.id), eq(pagePermissions.userId, userId)))
    .limit(1);

  if (perm) {
    if (level === 'view') return true;
    if (level === 'full_access') return perm.level === 'full_access';
    if (level === 'edit') return perm.level === 'full_access' || perm.level === 'can_edit';
    if (level === 'comment') {
      return (
        perm.level === 'full_access' ||
        perm.level === 'can_edit' ||
        perm.level === 'can_comment'
      );
    }
  }

  // No explicit permission — fall back to workspace membership (grants view/edit/comment, not full_access)
  if (level === 'full_access') return false;

  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, page.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm;
}

/**
 * Returns true when `userId` is a workspace admin for the workspace that owns `page`.
 * Workspace admins have role='admin' in workspaceMembers.
 */
export async function isWorkspaceAdmin(userId: string, page: PageRow): Promise<boolean> {
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, page.workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return !!wm && wm.role === 'admin';
}

export type { PermissionLevel };
