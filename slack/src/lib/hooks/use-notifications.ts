import useSWR from 'swr';
import { useRef, useEffect } from 'react';
import { sendBrowserNotification } from '@/lib/notifications/browser-notify';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export interface Notification {
  id: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  messageId?: string;
  message?: { id: string; content: string; channelId?: string; conversationId?: string; createdAt: string } | null;
  channel?: { id: string; name: string } | null;
}

export function useNotifications() {
  const { data, isLoading, mutate } = useSWR<Notification[]>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 5000 }
  );

  const notifications = Array.isArray(data) ? data : [];
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const prevUnreadCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevUnreadCountRef.current === null) {
      prevUnreadCountRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadCountRef.current) {
      const newest = notifications.find(n => !n.isRead);
      const title = newest?.channel ? `#${newest.channel.name}` : 'New message';
      const body = newest?.message?.content ?? 'You have a new notification';
      sendBrowserNotification(title, body);
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount, notifications]);

  // Item 12: Update document title with unread count
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (unreadCount > 0) {
      document.title = `Slack-A2A (${unreadCount})`;
    } else {
      document.title = 'Slack-A2A';
    }
  }, [unreadCount]);

  async function markAsRead(ids: string[]) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    await mutate();
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds);
    }
  }

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}
