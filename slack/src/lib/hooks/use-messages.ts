import useSWR from 'swr';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
  userNames: string[];
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
  isEdited?: boolean;
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
    isEdited: m.isEdited ?? false,
    threadCount: m.threadCount || 0,
    reactions: m.reactions
      ? Object.entries(m.reactions).map(([emoji, reactors]) => {
          const list = reactors as { userId: string; displayName: string }[];
          return {
            emoji,
            count: list.length,
            userIds: list.map(r => r.userId),
            userNames: list.map(r => r.displayName),
          };
        })
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
  currentUser?: { id: string; displayName: string; avatarUrl?: string };
}

export function useMessages({ channelId, conversationId, parentId, currentUser }: UseMessagesOptions) {
  const [cursor, setCursor] = useState<string | null>(null);

  const endpoint = parentId
    ? `/api/messages/${parentId}/thread`
    : channelId
    ? `/api/channels/${channelId}/messages`
    : conversationId
    ? `/api/dm/${conversationId}/messages`
    : null;

  const swrKey = endpoint;

  const rawFetcher = async (url: string) => {
    const res = await fetch(url);
    const json = await res.json();

    // Thread API returns { parent, thread }, channel/DM API returns { messages, nextCursor }
    if (json.thread) {
      return {
        messages: (json.thread ?? []).map(mapApiMessage),
        nextCursor: null,
      };
    }

    return {
      ...json,
      messages: (json.messages ?? []).map(mapApiMessage).reverse(),
    };
  };

  const { data, isLoading, mutate } = useSWR<{ messages: Message[]; nextCursor?: string }>(
    swrKey,
    rawFetcher,
    { refreshInterval: 3000 }
  );

  async function sendMessage(content: string, metadata?: Record<string, unknown>) {
    if (!endpoint) return;
    if (!content.trim()) return;

    const optimisticMessage: Message = {
      id: `optimistic-${Date.now()}`,
      content,
      contentType: 'text',
      senderId: currentUser?.id ?? 'me',
      senderName: currentUser?.displayName ?? 'You',
      senderAvatar: currentUser?.avatarUrl,
      createdAt: new Date().toISOString(),
      metadata,
      ...(parentId ? { parentId } : {}),
    };

    // Optimistically add message then POST — let SWR polling pick up the real message
    mutate(
      (current) => ({
        messages: [...(current?.messages ?? []), optimisticMessage],
        nextCursor: current?.nextCursor,
      }),
      { revalidate: false }
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, metadata, parentId }),
    });
    if (!res.ok) throw new Error('Failed to send message');
  }

  async function editMessage(messageId: string, content: string) {
    // Optimistically update the message content locally
    mutate(
      (current) => ({
        messages: (current?.messages ?? []).map((m) =>
          m.id === messageId
            ? { ...m, content, isEdited: true, editedAt: new Date().toISOString() }
            : m
        ),
        nextCursor: current?.nextCursor,
      }),
      { revalidate: false }
    );

    const res = await fetch(`/api/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to edit message');
    await mutate();
  }

  async function deleteMessage(messageId: string) {
    // Optimistically remove the message from local list
    mutate(
      (current) => ({
        messages: (current?.messages ?? []).filter((m) => m.id !== messageId),
        nextCursor: current?.nextCursor,
      }),
      { revalidate: false }
    );

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
