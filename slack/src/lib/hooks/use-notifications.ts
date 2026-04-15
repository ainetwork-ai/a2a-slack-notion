import useSWR from 'swr';
import { useRef, useEffect, useCallback } from 'react';
import { sendBrowserNotification } from '@/lib/notifications/browser-notify';
import { playNotificationSound } from '@/lib/notifications/notification-sound';

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
      const dndEnabled = typeof window !== 'undefined' && localStorage.getItem('dndEnabled') === 'true';
      if (!dndEnabled) {
        const newest = notifications.find(n => !n.isRead);
        const title = newest?.channel ? `#${newest.channel.name}` : 'New message';
        const body = newest?.message?.content ?? 'You have a new notification';
        sendBrowserNotification(title, body);
        playNotificationSound();
      }
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

  // Poll for due reminders and fire browser notifications
  const checkReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders', { method: 'PUT' });
      if (!res.ok) return;
      const { due } = await res.json() as { due: Array<{ id: string; message: string }> };
      if (!due || due.length === 0) return;

      const dndEnabled = typeof window !== 'undefined' && localStorage.getItem('dndEnabled') === 'true';
      for (const reminder of due) {
        if (!dndEnabled) {
          sendBrowserNotification('Reminder', reminder.message);
          playNotificationSound();
        }
        // Mark as completed
        await fetch('/api/reminders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: reminder.id }),
        });
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [checkReminders]);

  return { notifications, unreadCount, isLoading, markAsRead, markAllAsRead };
}
