'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export type PermissionLevel = 'full_access' | 'can_edit' | 'can_comment' | 'can_view';

export interface PagePermission {
  id: string;
  pageId: string;
  userId: string;
  level: PermissionLevel;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  pageId: string;
  token: string;
  level: PermissionLevel;
  isPublic: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export function usePagePermissions(pageId: string) {
  const key = `/api/pages/${pageId}/permissions`;
  const { data, isLoading, error, mutate } = useSWR<PagePermission[]>(key, fetcher);

  async function addPermission(userId: string, level: PermissionLevel) {
    const optimistic = (data ?? []).filter(p => p.userId !== userId).concat({
      id: `tmp-${userId}`,
      pageId,
      userId,
      level,
      createdAt: new Date().toISOString(),
    });
    await mutate(
      async () => {
        const res = await fetch(key, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, level }),
        });
        if (!res.ok) throw new Error('Failed to set permission');
        return mutate();
      },
      { optimisticData: optimistic, rollbackOnError: true }
    );
  }

  async function removePermission(userId: string) {
    const optimistic = (data ?? []).filter(p => p.userId !== userId);
    await mutate(
      async () => {
        const res = await fetch(key, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) throw new Error('Failed to remove permission');
        return mutate();
      },
      { optimisticData: optimistic, rollbackOnError: true }
    );
  }

  async function updatePermissionLevel(userId: string, level: PermissionLevel) {
    await addPermission(userId, level);
  }

  return {
    permissions: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
    addPermission,
    removePermission,
    updatePermissionLevel,
  };
}

export function useShareLinks(pageId: string) {
  const key = `/api/pages/${pageId}/share-links`;
  const { data, isLoading, error, mutate } = useSWR<ShareLink[]>(key, fetcher);

  async function createShareLink(opts: {
    level?: PermissionLevel;
    isPublic?: boolean;
    expiresAt?: string;
  }) {
    const res = await fetch(key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) throw new Error('Failed to create share link');
    await mutate();
  }

  async function revokeShareLink(token: string) {
    const optimistic = (data ?? []).filter(l => l.token !== token);
    await mutate(
      async () => {
        const res = await fetch(`${key}?token=${encodeURIComponent(token)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to revoke share link');
        return mutate();
      },
      { optimisticData: optimistic, rollbackOnError: true }
    );
  }

  return {
    shareLinks: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
    createShareLink,
    revokeShareLink,
  };
}
