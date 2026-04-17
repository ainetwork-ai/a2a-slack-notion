'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { AtSign, MessageSquare, FileText, Bell } from 'lucide-react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NotionNotification {
  id: string;
  type: 'mention' | 'comment' | 'page_update';
  title: string;
  body: string | null;
  pageId: string | null;
  read: boolean;
  createdAt: string;
}

interface NotionNotificationsResponse {
  items: NotionNotification[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Icon per notification type
// ---------------------------------------------------------------------------
function NotionTypeIcon({ type }: { type: NotionNotification['type'] }) {
  switch (type) {
    case 'comment':
      return <MessageSquare className="w-4 h-4 text-green-400 shrink-0" />;
    case 'mention':
      return <AtSign className="w-4 h-4 text-[#36c5f0] shrink-0" />;
    case 'page_update':
      return <FileText className="w-4 h-4 text-slate-400 shrink-0" />;
    default:
      return <Bell className="w-4 h-4 text-slate-400 shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------
const fetcher = (url: string) => fetch(url).then(r => r.json());

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function NotionNotifications() {
  const router = useRouter();
  const [markingAll, setMarkingAll] = useState(false);

  const { data, mutate } = useSWR<NotionNotificationsResponse>(
    '/api/notifications/notion?limit=30',
    fetcher,
    { refreshInterval: 10000 },
  );

  const items = data?.items ?? [];
  const unreadCount = items.filter(n => !n.read).length;

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await fetch('/api/notifications/notion/read-all', { method: 'POST' });
      await mutate();
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleItemClick(notification: NotionNotification) {
    if (!notification.read) {
      await fetch(`/api/notifications/notion/${notification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      await mutate();
    }
    if (notification.pageId) {
      router.push(`/pages/${notification.pageId}`);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-slate-500">
        <FileText className="w-6 h-6 mb-2 opacity-30" />
        <p className="text-xs">No page activity</p>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Pages
          {unreadCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="text-[11px] text-[#36c5f0] hover:text-[#36c5f0]/80 transition-colors disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Items */}
      {items.map(notification => (
        <button
          key={notification.id}
          onClick={() => handleItemClick(notification)}
          className={cn(
            'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-white/5 last:border-0',
            notification.read
              ? 'hover:bg-white/5'
              : 'bg-blue-500/10 hover:bg-blue-500/15 border-l-2 border-l-blue-400',
          )}
        >
          <div className="mt-0.5">
            <NotionTypeIcon type={notification.type} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                'text-sm leading-snug line-clamp-2',
                notification.read ? 'text-slate-300' : 'text-white font-medium',
              )}
            >
              {notification.title}
            </p>
            {notification.body && (
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                {notification.body}
              </p>
            )}
            <p className="text-[11px] text-slate-600 mt-1">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </p>
          </div>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-blue-400" />
          )}
        </button>
      ))}
    </div>
  );
}
