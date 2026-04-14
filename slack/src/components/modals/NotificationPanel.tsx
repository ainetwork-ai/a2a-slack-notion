'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, AtSign, MessageSquare, Mail } from 'lucide-react';
import { useNotifications, Notification } from '@/lib/hooks/use-notifications';
import { cn } from '@/lib/utils';

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'mention': return <AtSign className="w-4 h-4 text-[#36c5f0]" />;
    case 'thread_reply': return <MessageSquare className="w-4 h-4 text-green-400" />;
    case 'dm': return <Mail className="w-4 h-4 text-[#e879f9]" />;
    case 'agent_response': return <MessageSquare className="w-4 h-4 text-yellow-400" />;
    default: return <Bell className="w-4 h-4 text-slate-400" />;
  }
}

export default function NotificationPanel() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  async function handleClick(notification: Notification) {
    if (!notification.isRead) {
      await markAsRead([notification.id]);
    }
    if (notification.message?.channelId) {
      router.push(`/workspace/channel/${notification.message.channelId}`);
    } else if (notification.message?.conversationId) {
      router.push(`/workspace/dm/${notification.message.conversationId}`);
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
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            notifications.map(notification => (
              <button
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-white/5 last:border-0',
                  notification.isRead
                    ? 'hover:bg-white/5'
                    : 'bg-[#4a154b]/10 hover:bg-[#4a154b]/20'
                )}
              >
                <div className="mt-0.5 shrink-0">
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm leading-snug line-clamp-2',
                    notification.isRead ? 'text-slate-300' : 'text-white font-medium'
                  )}>
                    {notification.message?.content || 'New notification'}
                  </p>
                  {notification.channel && (
                    <p className="text-xs text-slate-500 mt-0.5">in #{notification.channel.name}</p>
                  )}
                  <p className="text-[11px] text-slate-600 mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {!notification.isRead && (
                  <span className="w-2 h-2 rounded-full bg-[#4a154b] mt-1.5 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
