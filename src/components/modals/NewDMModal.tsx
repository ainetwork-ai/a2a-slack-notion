'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search } from 'lucide-react';
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
}

export default function NewDMModal({ open, onOpenChange }: NewDMModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setIsLoading(false));
  }, [open]);

  const filtered = query.trim()
    ? users.filter(u => u.displayName.toLowerCase().includes(query.toLowerCase()))
    : users;

  async function handleSelect(userId: string) {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [userId] }),
      });
      if (!res.ok) throw new Error('Failed to create DM');
      const data = await res.json();
      onOpenChange(false);
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search people..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
              autoFocus
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="space-y-px max-h-64 overflow-y-auto scrollbar-slack">
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
                    onClick={() => handleSelect(user.id)}
                    disabled={isStarting}
                    className={cn(
                      'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                      'hover:bg-white/5',
                      isStarting && 'opacity-50 cursor-not-allowed'
                    )}
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
                    <span className="text-sm text-white">{user.displayName}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">
              {query ? 'No users found' : 'No users available'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
