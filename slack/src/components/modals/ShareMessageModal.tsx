'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Hash, Search, Loader2 } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useToast } from '@/components/ui/toast-provider';
import { cn } from '@/lib/utils';

interface Channel {
  id: string;
  name: string;
  description?: string | null;
}

interface ShareMessageModalProps {
  open: boolean;
  onClose: () => void;
  messageContent: string;
  sourceChannelName?: string;
}

export default function ShareMessageModal({
  open,
  onClose,
  messageContent,
  sourceChannelName,
}: ShareMessageModalProps) {
  const { activeWorkspaceName } = useWorkspaceStore();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const url = activeWorkspaceName
      ? `/api/channels?workspaceId=${encodeURIComponent(activeWorkspaceName)}`
      : '/api/channels';
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setChannels(list.map((c: { id: string; name: string; description?: string | null }) => ({
          id: c.id,
          name: c.name,
          description: c.description,
        })));
      })
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [open, activeWorkspaceName]);

  const filtered = channels.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleShare(channel: Channel) {
    setSending(channel.id);
    const prefix = sourceChannelName ? `Shared from #${sourceChannelName}: ` : 'Shared: ';
    const content = `${prefix}${messageContent}`;
    try {
      const res = await fetch(`/api/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        showToast(`Message shared to #${channel.name}`, 'success');
        onClose();
      } else {
        showToast('Failed to share message', 'error');
      }
    } catch {
      showToast('Failed to share message', 'error');
    } finally {
      setSending(null);
    }
  }

  function handleClose() {
    setSearch('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">Share message to channel</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-slate-400 bg-white/5 rounded-lg p-3 mt-1 line-clamp-3 border border-white/10">
          {messageContent}
        </div>

        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            autoFocus
            placeholder="Search channels"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
          />
        </div>

        <div className="mt-2 max-h-[300px] overflow-y-auto -mx-6 px-6">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
              <Hash className="w-7 h-7 opacity-40" />
              <p className="text-sm text-slate-400">
                {search ? `No channels matching "${search}"` : 'No channels found'}
              </p>
            </div>
          )}

          {!loading && filtered.map(channel => (
            <div
              key={channel.id}
              className={cn(
                'flex items-center justify-between gap-3 py-2.5 border-b border-white/5 last:border-0',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{channel.name}</p>
                  {channel.description && (
                    <p className="text-xs text-slate-500 truncate">{channel.description}</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleShare(channel)}
                disabled={!!sending}
                className="h-7 px-3 text-xs bg-[#4a154b] hover:bg-[#611f6a] text-white shrink-0"
              >
                {sending === channel.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Share'
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
