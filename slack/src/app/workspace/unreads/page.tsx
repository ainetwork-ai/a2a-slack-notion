'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Hash, Inbox } from 'lucide-react';
import { format } from 'date-fns';

interface Channel {
  id: string;
  name: string;
  unread?: boolean;
  lastReadAt?: string | null;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  senderName?: string;
  senderId?: string;
}

interface ChannelUnreads {
  channel: Channel;
  messages: Message[];
}

export default function UnreadsPage() {
  const router = useRouter();
  const [unreads, setUnreads] = useState<ChannelUnreads[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/channels');
        const channels: Channel[] = await res.json();
        const unreadChannels = Array.isArray(channels)
          ? channels.filter(c => c.unread)
          : [];

        const results = await Promise.all(
          unreadChannels.map(async (channel) => {
            try {
              const params = new URLSearchParams({ limit: '20' });
              if (channel.lastReadAt) {
                params.set('after', channel.lastReadAt);
              }
              const msgRes = await fetch(
                `/api/channels/${channel.id}/messages?${params.toString()}`
              );
              const data = await msgRes.json();
              const messages: Message[] = Array.isArray(data.messages)
                ? data.messages
                : Array.isArray(data)
                ? data
                : [];
              return { channel, messages };
            } catch {
              return { channel, messages: [] };
            }
          })
        );

        setUnreads(results.filter(r => r.messages.length > 0));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-400">
        <div className="animate-spin w-6 h-6 border-2 border-slate-600 border-t-slate-300 rounded-full mb-3" />
        Loading unreads...
      </div>
    );
  }

  if (unreads.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-400 gap-3">
        <Inbox className="w-10 h-10 opacity-40" />
        <p className="text-sm">You&apos;re all caught up!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/5 shrink-0 bg-[#1a1d21]">
        <Inbox className="w-5 h-5 text-slate-400" />
        <span className="font-semibold text-white">All Unreads</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {unreads.map(({ channel, messages }) => (
          <div key={channel.id}>
            <button
              className="flex items-center gap-1.5 text-sm font-semibold text-white mb-2 hover:text-[#36c5f0] transition-colors"
              onClick={() => router.push(`/workspace/channel/${channel.id}`)}
            >
              <Hash className="w-4 h-4 text-slate-400" />
              {channel.name}
              <span className="ml-1 text-xs font-normal text-slate-500">
                {messages.length} unread
              </span>
            </button>
            <div className="space-y-1 pl-5 border-l border-white/5">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className="group flex items-start gap-2 py-1 rounded hover:bg-white/[0.03] cursor-pointer"
                  onClick={() => router.push(`/workspace/channel/${channel.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-slate-300 mr-2">
                      {msg.senderName ?? 'Unknown'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {format(new Date(msg.createdAt), 'h:mm a')}
                    </span>
                    <p className="text-sm text-slate-300 truncate">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
