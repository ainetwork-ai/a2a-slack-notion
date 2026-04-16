'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Hash, Search, Users, Loader2, Check } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface BrowseChannel {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  isMember: boolean;
  createdAt: string;
}

export default function BrowseChannelsModal() {
  const router = useRouter();
  const { browseChannelsOpen, setBrowseChannelsOpen } = useAppStore();
  const { activeWorkspaceId } = useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  // Debounced search query
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const url = activeWorkspaceId
    ? `/api/channels/browse?workspaceId=${activeWorkspaceId}${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''}`
    : `/api/channels/browse${debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ''}`;

  const { data, mutate } = useSWR<BrowseChannel[]>(
    browseChannelsOpen ? url : null,
    fetcher
  );

  const channels = Array.isArray(data) ? data : [];

  async function handleJoin(ch: { id: string; name: string }) {
    setJoining(ch.id);
    try {
      const res = await fetch(`/api/channels/${ch.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await mutate();
        setBrowseChannelsOpen(false);
        router.push(`/workspace/channel/${encodeURIComponent(ch.name)}`);
      }
    } finally {
      setJoining(null);
    }
  }

  function handleOpen(ch: { name: string }) {
    setBrowseChannelsOpen(false);
    router.push(`/workspace/channel/${encodeURIComponent(ch.name)}`);
  }

  function handleClose() {
    setBrowseChannelsOpen(false);
    setSearch('');
  }

  return (
    <Dialog open={browseChannelsOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Browse channels</DialogTitle>
        </DialogHeader>

        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            autoFocus
            placeholder="Search channels"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
          />
        </div>

        <div className="mt-2 max-h-[400px] overflow-y-auto -mx-6 px-6">
          {!data && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {data && channels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
              <Hash className="w-8 h-8 opacity-40" />
              <p className="text-sm font-medium text-slate-400">
                {search ? `No results found for "${search}"` : 'No public channels found'}
              </p>
              {search && (
                <p className="text-xs text-slate-500">Try a different search term.</p>
              )}
            </div>
          )}

          {channels.map(channel => (
            <div
              key={channel.id}
              className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-medium text-white text-sm truncate">{channel.name}</span>
                  {channel.isMember && (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-400 shrink-0">
                      <Check className="w-3 h-3" />
                      Joined
                    </span>
                  )}
                </div>
                {channel.description && (
                  <p className="text-xs text-slate-400 truncate ml-5">{channel.description}</p>
                )}
                <div className="flex items-center gap-1 ml-5 mt-0.5">
                  <Users className="w-3 h-3 text-slate-600" />
                  <span className="text-[11px] text-slate-500">{channel.memberCount} {channel.memberCount === 1 ? 'member' : 'members'}</span>
                </div>
              </div>
              <div className="shrink-0">
                {channel.isMember ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpen(channel)}
                    className="h-7 px-3 text-xs text-[#bcabbc] hover:text-white hover:bg-white/10"
                  >
                    Open
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleJoin(channel)}
                    disabled={joining === channel.id}
                    className="h-7 px-3 text-xs bg-[#4a154b] hover:bg-[#611f6a] text-white"
                  >
                    {joining === channel.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      'Join'
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
