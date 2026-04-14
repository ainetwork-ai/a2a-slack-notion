'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewDMModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserResult {
  id: string;
  displayName: string;
  avatarUrl?: string;
  status?: string;
  isAgent?: boolean;
}

export default function NewDMModal({ open, onOpenChange }: NewDMModalProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : data.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setIsLoading(false));
  }, [open]);

  const filtered = query.trim()
    ? users.filter(u =>
        u.displayName.toLowerCase().includes(query.toLowerCase()) &&
        !selected.find(s => s.id === u.id)
      )
    : users.filter(u => !selected.find(s => s.id === u.id));

  function toggleSelect(user: UserResult) {
    setSelected(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
    setQuery('');
  }

  async function handleGo() {
    if (selected.length === 0 || isStarting) return;
    setIsStarting(true);
    try {
      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selected.map(u => u.id) }),
      });
      if (!res.ok) throw new Error('Failed to create DM');
      const data = await res.json();
      onOpenChange(false);
      setSelected([]);
      setQuery('');
      mutate('/api/dm'); // Refresh DM list
      router.push(`/workspace/dm/${data.id}`);
    } catch {
      // silently fail
    } finally {
      setIsStarting(false);
    }
  }

  function handleOpenChange(val: boolean) {
    if (!val) {
      setQuery('');
      setSelected([]);
    }
    onOpenChange(val);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">New Direct Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Selected users */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map(user => (
                <span
                  key={user.id}
                  className="flex items-center gap-1.5 bg-[#4a154b]/30 border border-[#4a154b]/50 text-white text-xs rounded-full px-2.5 py-1"
                >
                  {user.displayName}
                  <button onClick={() => toggleSelect(user)} className="hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder={selected.length > 0 ? "Add more people..." : "Search people..."}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
              autoFocus
            />
          </div>

          {/* User list */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="space-y-px max-h-48 overflow-y-auto scrollbar-slack">
              {filtered.map(user => {
                const initials = user.displayName
                  .split(' ')
                  .map(w => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleSelect(user)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left hover:bg-white/5"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="w-8 h-8">
                        {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                        <AvatarFallback className="bg-[#4a154b] text-white text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1a1d21]',
                          user.status === 'online' ? 'bg-green-400' : 'bg-slate-500'
                        )}
                      />
                    </div>
                    <span className="text-sm text-white flex-1">{user.displayName}</span>
                    {user.isAgent && (
                      <span className="text-[10px] bg-[#36c5f0]/20 text-[#36c5f0] px-1.5 py-0.5 rounded">Bot</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">
              {query ? 'No users found' : 'No users available'}
            </p>
          )}

          {/* Go button */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGo}
              disabled={selected.length === 0 || isStarting}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isStarting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</>
              ) : (
                <><MessageSquare className="w-4 h-4 mr-2" />Go {selected.length > 0 ? `(${selected.length})` : ''}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
