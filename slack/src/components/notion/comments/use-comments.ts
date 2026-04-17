'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export interface BlockComment {
  id: string;
  blockId: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  content: unknown;
  threadId: string | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Safely extract a display string from the `content` field (string or JSON). */
export function extractContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    // Handle Notion-style { text: string } or { content: string } shapes
    const c = content as Record<string, unknown>;
    if (typeof c.text === 'string') return c.text;
    if (typeof c.content === 'string') return c.content;
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }
  return '';
}

/** Groups a flat comment list into threads keyed by top-level comment id. */
export function byThread(comments: BlockComment[]): Map<string, BlockComment[]> {
  const map = new Map<string, BlockComment[]>();
  const topLevel = comments.filter(c => c.threadId == null);
  for (const root of topLevel) {
    map.set(root.id, [root, ...comments.filter(c => c.threadId === root.id)]);
  }
  return map;
}

export function useComments(blockId: string | null | undefined) {
  const key = blockId ? `/api/comments?blockId=${blockId}` : null;
  const { data, isLoading, mutate } = useSWR<BlockComment[]>(key, fetcher, {
    revalidateOnFocus: false,
  });

  const comments = data ?? [];

  async function createComment(params: {
    blockId: string;
    content: string;
    threadId?: string;
  }): Promise<BlockComment> {
    // Optimistic: prepend temp item
    const tempId = `temp-${Date.now()}`;
    const temp: BlockComment = {
      id: tempId,
      blockId: params.blockId,
      authorId: '',
      content: params.content,
      threadId: params.threadId ?? null,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await mutate(
      async (current) => {
        const res = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) throw new Error('Failed to create comment');
        const created: BlockComment = await res.json();
        const prev = current ?? [];
        return [created, ...prev.filter(c => c.id !== tempId)];
      },
      {
        optimisticData: [temp, ...comments],
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      }
    );

    // Return the first item after mutation (the created one)
    const updated = await mutate();
    return (updated ?? [])[0] ?? temp;
  }

  async function updateComment(id: string, payload: { content?: string; resolved?: boolean }) {
    await mutate(
      async (current) => {
        const res = await fetch(`/api/comments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update comment');
        const updated: BlockComment = await res.json();
        return (current ?? []).map(c => (c.id === id ? updated : c));
      },
      {
        optimisticData: comments.map(c =>
          c.id === id ? { ...c, ...payload, updatedAt: new Date().toISOString() } : c
        ),
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      }
    );
  }

  async function deleteComment(id: string) {
    await mutate(
      async (current) => {
        const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete comment');
        return (current ?? []).filter(c => c.id !== id);
      },
      {
        optimisticData: comments.filter(c => c.id !== id),
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      }
    );
  }

  async function toggleResolved(id: string) {
    const comment = comments.find(c => c.id === id);
    if (!comment) return;
    await updateComment(id, { resolved: !comment.resolved });
  }

  async function replyTo(parentId: string, content: string) {
    const parent = comments.find(c => c.id === parentId);
    if (!parent) return;
    const rootId = parent.threadId ?? parent.id;
    await createComment({ blockId: parent.blockId, content, threadId: rootId });
  }

  return {
    comments,
    isLoading,
    mutate,
    byThread: () => byThread(comments),
    createComment,
    updateComment,
    deleteComment,
    toggleResolved,
    replyTo,
  };
}
