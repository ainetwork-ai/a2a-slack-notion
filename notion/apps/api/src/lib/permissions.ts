import { prisma } from './prisma.js';

type PermLevel = 'full_access' | 'can_edit' | 'can_comment' | 'can_view';

const LEVEL_HIERARCHY: Record<PermLevel, number> = {
  full_access: 4,
  can_edit: 3,
  can_comment: 2,
  can_view: 1,
};

/**
 * Check if a user has at least the required permission level on a page.
 * Permission resolution order:
 * 1. Explicit PagePermission for this user + page
 * 2. Walk up parent pages (permission inheritance)
 * 3. Workspace role fallback (admin/member = full_access, guest = can_view)
 */
export async function checkPagePermission(
  userId: string,
  pageId: string,
  required: PermLevel,
): Promise<boolean> {
  // 1. Check explicit permission on this page
  const explicit = await prisma.pagePermission.findUnique({
    where: { pageId_userId: { pageId, userId } },
  });
  if (explicit) {
    return LEVEL_HIERARCHY[explicit.level as PermLevel] >= LEVEL_HIERARCHY[required];
  }

  // 2. Walk up parent chain (inheritance)
  const page = await prisma.block.findUnique({
    where: { id: pageId },
    select: { parentId: true, workspaceId: true },
  });
  if (!page) return false;

  // Walk up the parent chain
  let currentPageId: string | null = page.parentId;
  let depth = 0;
  while (currentPageId && depth < 20) {
    const parentPerm = await prisma.pagePermission.findUnique({
      where: { pageId_userId: { pageId: currentPageId, userId } },
    });
    if (parentPerm) {
      return LEVEL_HIERARCHY[parentPerm.level as PermLevel] >= LEVEL_HIERARCHY[required];
    }
    const parent = await prisma.block.findUnique({
      where: { id: currentPageId },
      select: { parentId: true },
    });
    currentPageId = parent?.parentId ?? null;
    depth++;
  }

  // 3. Workspace role fallback
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: page.workspaceId, userId } },
  });
  if (!member) return false;

  // Admin and member get full access by default, guest gets view only
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
  const explicit = await prisma.pagePermission.findUnique({
    where: { pageId_userId: { pageId, userId } },
  });
  if (explicit) return explicit.level as PermLevel;

  const page = await prisma.block.findUnique({
    where: { id: pageId },
    select: { parentId: true, workspaceId: true },
  });
  if (!page) return null;

  if (page.parentId) {
    const parentPerm = await prisma.pagePermission.findUnique({
      where: { pageId_userId: { pageId: page.parentId, userId } },
    });
    if (parentPerm) return parentPerm.level as PermLevel;
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: page.workspaceId, userId } },
  });
  if (!member) return null;
  if (member.role === 'admin' || member.role === 'member') return 'full_access';
  return 'can_view';
}
