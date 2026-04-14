import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export interface Channel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  createdAt: string;
  workspaceId?: string;
  memberCount?: number;
  unreadCount?: number;
  unread?: boolean;
}

export function useChannels(workspaceId?: string) {
  const url = workspaceId
    ? `/api/channels?workspaceId=${workspaceId}`
    : '/api/channels';

  const { data, isLoading, mutate } = useSWR<Channel[]>(
    url,
    fetcher,
    { refreshInterval: 5000 }
  );

  async function createChannel(params: {
    name: string;
    description?: string;
    isPrivate?: boolean;
    workspaceId?: string;
  }) {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create channel');
    }
    const result = await res.json();
    await mutate();
    return result;
  }

  return {
    channels: Array.isArray(data) ? data : [],
    isLoading,
    mutate,
    createChannel,
  };
}
