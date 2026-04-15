'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus, X, Bot } from 'lucide-react';
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
  isAgent?: boolean;
}

const ENGAGEMENT_OPTIONS = [
  { level: 0, emoji: '—', label: 'Silent', description: 'Only responds when @mentioned' },
  { level: 1, emoji: '👁', label: 'Reactive', description: 'Responds to mentions + active threads' },
  { level: 2, emoji: '💬', label: 'Engaged', description: 'Joins relevant conversations', recommended: true },
  { level: 3, emoji: '⚡', label: 'Proactive', description: 'Actively participates' },
];

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
  // engagement level per selected agent id
  const [agentEngagement, setAgentEngagement] = useState<Record<string, number>>({});

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
    setSelected(prev => {
      if (prev.find(u => u.id === user.id)) {
        return prev.filter(u => u.id !== user.id);
      }
      // Default engagement level 2 (Engaged) for agents
      if (user.isAgent) {
        setAgentEngagement(e => ({ ...e, [user.id]: 2 }));
      }
      return [...prev, user];
    });
  }

  async function handleInvite() {
    if (selected.length === 0) return;
    setIsInviting(true);
    setError(null);
    try {
      await Promise.all(
        selected.map(async user => {
          const res = await fetch(`/api/channels/${channelId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
          // After adding agent member, set engagement level
          if (res.ok && user.isAgent) {
            const level = agentEngagement[user.id] ?? 2;
            await fetch(`/api/channels/${channelId}/members`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'setEngagementLevel', targetUserId: user.id, engagementLevel: level }),
            });
          }
        })
      );
      onOpenChange(false);
      setSelected([]);
      setQuery('');
      setResults([]);
      setAgentEngagement({});
    } catch {
      setError('Failed to invite some members');
    } finally {
      setIsInviting(false);
    }
  }

  const humanResults = results.filter(u => !u.isAgent);
  const agentResults = results.filter(u => u.isAgent);

  function renderUserRow(user: UserResult) {
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
          <AvatarFallback className={cn('text-white text-xs', user.isAgent ? 'bg-[#36c5f0]/20' : 'bg-[#4a154b]')}>
            {user.isAgent ? <Bot className="w-4 h-4 text-[#36c5f0]" /> : initials}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-white flex-1">{user.displayName}</span>
        {user.isAgent && (
          <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30 shrink-0">
            Bot
          </Badge>
        )}
        {isSelected && <span className="text-[#36c5f0] text-xs ml-1">Selected</span>}
      </button>
    );
  }

  // Show engagement picker for selected agents
  const selectedAgents = selected.filter(u => u.isAgent);

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
                  {user.isAgent && <Bot className="w-3 h-3 text-[#36c5f0]" />}
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
            <div className="max-h-52 overflow-y-auto scrollbar-slack space-y-1">
              {humanResults.length > 0 && (
                <div>
                  {humanResults.map(renderUserRow)}
                </div>
              )}
              {agentResults.length > 0 && (
                <div>
                  {humanResults.length > 0 && (
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">Agents</p>
                  )}
                  {humanResults.length === 0 && agentResults.length > 0 && (
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">Agents</p>
                  )}
                  {agentResults.map(renderUserRow)}
                </div>
              )}
            </div>
          ) : query ? (
            <p className="text-sm text-slate-500 text-center py-3">No users found</p>
          ) : null}

          {/* Engagement level picker for selected agents */}
          {selectedAgents.length > 0 && (
            <div className="space-y-2 border-t border-white/5 pt-3">
              {selectedAgents.map(agent => (
                <div key={agent.id}>
                  <p className="text-xs text-slate-400 mb-1.5">
                    <Bot className="w-3 h-3 inline mr-1 text-[#36c5f0]" />
                    <span className="font-medium text-white">{agent.displayName}</span> engagement level
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {ENGAGEMENT_OPTIONS.map(opt => (
                      <button
                        key={opt.level}
                        type="button"
                        onClick={() => setAgentEngagement(e => ({ ...e, [agent.id]: opt.level }))}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors text-xs',
                          (agentEngagement[agent.id] ?? 2) === opt.level
                            ? 'bg-[#4a154b]/30 border-[#4a154b]/60 text-white'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        )}
                      >
                        <span className="shrink-0">{opt.emoji}</span>
                        <span className="font-medium">{opt.label}</span>
                        {opt.recommended && (
                          <span className="text-[9px] bg-[#007a5a]/20 text-green-400 border border-green-500/20 px-0.5 rounded leading-tight">rec</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

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
