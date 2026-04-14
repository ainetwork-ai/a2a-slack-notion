'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  channelName?: string;
}

interface UserResult {
  id: string;
  displayName: string;
  avatarUrl?: string;
  address?: string;
}

export default function InviteMemberModal({
  open,
  onOpenChange,
  channelId,
  channelName,
}: InviteMemberModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data.users ?? []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function toggleSelect(user: UserResult) {
    setSelected(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
  }

  async function handleInvite() {
    if (selected.length === 0) return;
    setIsInviting(true);
    setError(null);
    try {
      await Promise.all(
        selected.map(user =>
          fetch(`/api/channels/${channelId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          })
        )
      );
      onOpenChange(false);
      setSelected([]);
      setQuery('');
      setResults([]);
    } catch (err) {
      setError('Failed to invite some members');
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">
            Invite people{channelName ? ` to #${channelName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Selected users */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map(user => (
                <span
                  key={user.id}
                  className="flex items-center gap-1.5 bg-[#4a154b]/30 border border-[#4a154b]/50 text-white text-xs rounded-full px-2 py-1"
                >
                  {user.displayName}
                  <button onClick={() => toggleSelect(user)}>
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
              placeholder="Search by name or address..."
              value={query}
              onChange={e => handleSearch(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
              autoFocus
            />
          </div>

          {/* Results */}
          {isSearching ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-slack">
              {results.map(user => {
                const isSelected = !!selected.find(u => u.id === user.id);
                const initials = user.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleSelect(user)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                      isSelected ? 'bg-[#4a154b]/30' : 'hover:bg-white/5'
                    )}
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                      <AvatarFallback className="bg-[#4a154b] text-white text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-white flex-1">{user.displayName}</span>
                    {isSelected && <span className="text-[#36c5f0] text-xs">Selected</span>}
                  </button>
                );
              })}
            </div>
          ) : query ? (
            <p className="text-sm text-slate-500 text-center py-3">No users found</p>
          ) : null}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={selected.length === 0 || isInviting}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isInviting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Inviting...</>
              ) : (
                <><UserPlus className="w-4 h-4 mr-2" />Invite {selected.length > 0 ? `(${selected.length})` : ''}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
