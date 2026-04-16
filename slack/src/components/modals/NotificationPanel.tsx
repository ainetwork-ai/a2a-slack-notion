'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, AtSign, MessageSquare, Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { useNotifications, Notification } from '@/lib/hooks/use-notifications';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast-provider';

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'mention': return <AtSign className="w-4 h-4 text-[#36c5f0]" />;
    case 'thread_reply': return <MessageSquare className="w-4 h-4 text-green-400" />;
    case 'dm': return <Mail className="w-4 h-4 text-[#e879f9]" />;
    case 'agent_response': return <MessageSquare className="w-4 h-4 text-yellow-400" />;
    default: return <Bell className="w-4 h-4 text-slate-400" />;
  }
}

interface NotificationGroup {
  channelName: string | null;
  channelId: string | null;
  notifications: Notification[];
  latestAt: Date;
  unreadCount: number;
}

function groupNotifications(notifications: Notification[]): NotificationGroup[] {
  const groupMap = new Map<string, NotificationGroup>();

  for (const n of notifications) {
    const key = n.channel?.id ?? '__dm__';
    const channelName = n.channel?.name ?? null;
    const channelId = n.channel?.id ?? null;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        channelName,
        channelId,
        notifications: [],
        latestAt: new Date(n.createdAt),
        unreadCount: 0,
      });
    }

    const group = groupMap.get(key)!;
    group.notifications.push(n);
    if (!n.isRead) group.unreadCount++;
    const nDate = new Date(n.createdAt);
    if (nDate > group.latestAt) group.latestAt = nDate;
  }

  // Sort groups by most recent notification descending
  return Array.from(groupMap.values()).sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
}

export default function NotificationPanel() {
  const router = useRouter();
  const { showToast } = useToast();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groups = groupNotifications(notifications);

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleClick(notification: Notification) {
    if (!notification.isRead) {
      await markAsRead([notification.id]);
    }
    if (notification.message?.channelId) {
      router.push(`/workspace/channel/${notification.message.channelId}`);
    } else if (notification.message?.conversationId) {
      router.push(`/workspace/dm/${notification.message.conversationId}`);
    } else {
      showToast('Message not found', 'error');
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 bg-[#222529] border-white/10 text-white p-0"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <p className="text-white font-semibold text-sm">
            Notifications
          </p>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="h-6 text-xs text-[#36c5f0] hover:text-[#36c5f0]/80 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-slack">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            groups.map((group) => {
              const key = group.channelId ?? '__dm__';
              const isCollapsed = collapsedGroups.has(key);
              const label = group.channelName ? `#${group.channelName}` : 'Direct Messages';

              return (
                <div key={key} className="border-b border-white/10 last:border-0">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors text-left"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                      : <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
                    }
                    <span className="text-xs font-semibold text-slate-300 flex-1 truncate">
                      {label}
                    </span>
                    {group.unreadCount > 0 && (
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                        {group.unreadCount > 99 ? '99+' : group.unreadCount}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-600 ml-1">
                      {formatDistanceToNow(group.latestAt, { addSuffix: true })}
                    </span>
                  </button>

                  {/* Group items */}
                  {!isCollapsed && group.notifications.map(notification => (
                    <button
                      key={notification.id}
                      onClick={() => handleClick(notification)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-t border-white/5',
                        notification.isRead
                          ? 'hover:bg-white/5'
                          : notification.type === 'mention'
                          ? 'bg-yellow-500/10 hover:bg-yellow-500/20 border-l-2 border-l-yellow-500'
                          : 'bg-[#4a154b]/10 hover:bg-[#4a154b]/20'
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        <NotificationIcon type={notification.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm leading-snug line-clamp-2',
                          notification.isRead
                            ? 'text-slate-300'
                            : notification.type === 'mention'
                            ? 'text-yellow-100 font-medium'
                            : 'text-white font-medium'
                        )}>
                          {notification.message?.content || 'New notification'}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <span className={cn(
                          'w-2 h-2 rounded-full mt-1.5 shrink-0',
                          notification.type === 'mention' ? 'bg-yellow-500' : 'bg-[#4a154b]'
                        )} />
                      )}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
