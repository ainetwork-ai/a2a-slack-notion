import useSWR from 'swr';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface Message {
  id: string;
  content: string;
  contentType: 'text' | 'agent-response' | 'file' | 'system';
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  isAgent?: boolean;
  createdAt: string;
  editedAt?: string;
  threadCount?: number;
  reactions?: Reaction[];
  metadata?: Record<string, unknown>;
  parentId?: string;
  pinnedAt?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiMessage(m: any): Message {
  return {
    id: m.id,
    content: m.content,
    contentType: m.contentType || 'text',
    senderId: m.user?.id || m.userId || m.senderId || '',
    senderName: m.user?.displayName || m.senderName || 'Unknown',
    senderAvatar: m.user?.avatarUrl || m.senderAvatar,
    isAgent: m.user?.isAgent || m.isAgent || false,
    createdAt: m.createdAt,
    editedAt: m.updatedAt !== m.createdAt ? m.updatedAt : undefined,
    threadCount: m.threadCount || 0,
    reactions: m.reactions
      ? Object.entries(m.reactions).map(([emoji, count]) => ({
          emoji,
          count: count as number,
          userIds: [],
        }))
      : [],
    metadata: m.metadata,
    parentId: m.parentId,
    pinnedAt: m.pinnedAt ?? null,
  };
}

interface UseMessagesOptions {
  channelId?: string;
  conversationId?: string;
  parentId?: string;
}

export function useMessages({ channelId, conversationId, parentId }: UseMessagesOptions) {
  const [cursor, setCursor] = useState<string | null>(null);

  const endpoint = channelId
    ? `/api/channels/${channelId}/messages`
    : conversationId
    ? `/api/dm/${conversationId}/messages`
    : null;

  const swrKey = endpoint
    ? parentId
      ? `${endpoint}?parentId=${parentId}`
      : endpoint
    : null;

  const rawFetcher = async (url: string) => {
    const res = await fetch(url);
    const json = await res.json();
    return {
      ...json,
      messages: (json.messages ?? []).map(mapApiMessage).reverse(),
    };
  };

  const { data, isLoading, mutate } = useSWR<{ messages: Message[]; nextCursor?: string }>(
    swrKey,
    rawFetcher,
    { refreshInterval: 2000 }
  );

  async function sendMessage(content: string, metadata?: Record<string, unknown>) {
    if (!endpoint) return;

    const optimisticMessage: Message = {
      id: `optimistic-${Date.now()}`,
      content,
      contentType: 'text',
      senderId: 'me',
      senderName: 'You',
      createdAt: new Date().toISOString(),
      metadata,
      ...(parentId ? { parentId } : {}),
    };

    // Optimistically add message, then POST, then revalidate
    mutate(
      (current) => ({
        messages: [...(current?.messages ?? []), optimisticMessage],
        nextCursor: current?.nextCursor,
      }),
      { revalidate: false }
    );

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, metadata, parentId }),
      });
      if (!res.ok) throw new Error('Failed to send message');
    } finally {
      // Wait briefly for the server to be consistent, then force a fresh fetch
      await new Promise(r => setTimeout(r, 100));
      await mutate(undefined, { revalidate: true });
    }
  }

  async function editMessage(messageId: string, content: string) {
    const res = await fetch(`/api/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to edit message');
    await mutate();
  }

  async function deleteMessage(messageId: string) {
    const res = await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete message');
    await mutate();
  }

  async function loadMore() {
    if (!endpoint || !data?.nextCursor) return;
    const nextCursor = data.nextCursor;
    const res = await fetch(`${endpoint}?cursor=${nextCursor}`);
    if (!res.ok) return;
    const older = await res.json();
    setCursor(nextCursor);
    await mutate(
      (current) => ({
        messages: [...older.messages, ...(current?.messages ?? [])],
        nextCursor: older.nextCursor,
      }),
      { revalidate: false }
    );
  }

  return {
    messages: data?.messages ?? [],
    isLoading,
    mutate,
    sendMessage,
    editMessage,
    deleteMessage,
    loadMore,
    hasMore: !!data?.nextCursor,
    cursor,
  };
}
