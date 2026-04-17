'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Search, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePagePermissions, useShareLinks } from './use-page-permissions';
import type { PermissionLevel } from './use-page-permissions';
import { PermissionLevelSelect } from './PermissionLevelSelect';
import { ShareLinkCard } from './ShareLinkCard';

interface UserResult {
  id: string;
  displayName: string;
}

interface PageShareModalProps {
  pageId: string;
  open: boolean;
  onClose: () => void;
}

const DEFAULT_ADD_LEVEL: PermissionLevel = 'can_view';

export function PageShareModal({ pageId, open, onClose }: PageShareModalProps) {
  // People tab state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addLevel, setAddLevel] = useState<PermissionLevel>(DEFAULT_ADD_LEVEL);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Share link tab state
  const [newLinkLevel, setNewLinkLevel] = useState<PermissionLevel>('can_view');
  const [newLinkPublic, setNewLinkPublic] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const {
    permissions,
    isLoading: permsLoading,
    addPermission,
    removePermission,
    updatePermissionLevel,
  } = usePagePermissions(pageId);

  const {
    shareLinks,
    isLoading: linksLoading,
    createShareLink,
    revokeShareLink,
  } = useShareLinks(pageId);

  // Search users via /api/users/search — falls back to treating raw input as userId
  async function handleSearch(q: string) {
    setQuery(q);
    setAddUserId(q.trim());
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        const users: UserResult[] = Array.isArray(data) ? data : (data.users ?? []);
        setSearchResults(users);
      } else {
        // Endpoint may not exist — treat typed value as raw userId
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function selectUser(user: UserResult) {
    setAddUserId(user.id);
    setQuery(user.displayName);
    setSearchResults([]);
  }

  async function handleAddPerson() {
    const uid = addUserId.trim();
    if (!uid) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addPermission(uid, addLevel);
      setQuery('');
      setAddUserId('');
      setSearchResults([]);
    } catch {
      setAddError('Failed to add permission');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleLevelChange(userId: string, level: PermissionLevel) {
    try {
      await updatePermissionLevel(userId, level);
    } catch {
      // silently ignore — SWR will rollback
    }
  }

  async function handleRemove(userId: string) {
    try {
      await removePermission(userId);
    } catch {
      // silently ignore — SWR will rollback
    }
  }

  async function handleCreateLink() {
    setIsCreating(true);
    setLinkError(null);
    try {
      await createShareLink({ level: newLinkLevel, isPublic: newLinkPublic });
    } catch {
      setLinkError('Failed to create share link');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Share page</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="people" className="mt-2">
          <TabsList variant="default" className="bg-white/5 w-full">
            <TabsTrigger value="people" className="flex-1">People</TabsTrigger>
            <TabsTrigger value="link" className="flex-1">Anyone with link</TabsTrigger>
          </TabsList>

          {/* ── People tab ── */}
          <TabsContent value="people" className="space-y-4 mt-4">
            {/* Add person row */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or paste user ID…"
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
                />
              </div>

              {/* Search results dropdown */}
              {(isSearching || searchResults.length > 0) && (
                <div className="rounded-lg border border-white/10 bg-[#222529] overflow-hidden max-h-40 overflow-y-auto">
                  {isSearching ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    </div>
                  ) : (
                    searchResults.map(user => (
                      <button
                        key={user.id}
                        onClick={() => selectUser(user)}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors"
                      >
                        {user.displayName}
                        <span className="text-slate-500 text-xs ml-2">{user.id}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <PermissionLevelSelect value={addLevel} onChange={setAddLevel} />
                <Button
                  size="sm"
                  onClick={handleAddPerson}
                  disabled={!addUserId.trim() || isAdding}
                  className="bg-[#4a154b] hover:bg-[#611f6a] text-white shrink-0"
                >
                  {isAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                  )}
                </Button>
              </div>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
            </div>

            {/* Current permissions list */}
            <div className="space-y-1">
              {permsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : permissions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-3">No individual permissions set</p>
              ) : (
                permissions.map(perm => (
                  <div
                    key={perm.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#4a154b]/40 flex items-center justify-center shrink-0">
                      <span className="text-xs text-white font-medium">
                        {perm.userId.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="flex-1 text-sm text-white font-mono text-xs truncate">
                      {perm.userId}
                    </span>
                    <PermissionLevelSelect
                      value={perm.level}
                      onChange={level => handleLevelChange(perm.userId, level)}
                    />
                    <button
                      onClick={() => handleRemove(perm.userId)}
                      className={cn(
                        'text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100',
                      )}
                      title="Remove permission"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── Anyone with link tab ── */}
          <TabsContent value="link" className="space-y-4 mt-4">
            {/* New link settings */}
            <div className="flex items-center gap-2 p-3 rounded-lg border border-white/5 bg-white/[0.02]">
              <span className="text-sm text-slate-400 flex-1">New link access</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newLinkPublic}
                  onChange={e => setNewLinkPublic(e.target.checked)}
                  className="accent-[#4a154b]"
                />
                Public
              </label>
              <PermissionLevelSelect value={newLinkLevel} onChange={setNewLinkLevel} />
              <Button
                size="sm"
                onClick={handleCreateLink}
                disabled={isCreating}
                className="bg-[#4a154b] hover:bg-[#611f6a] text-white shrink-0"
              >
                {isCreating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Create link'
                )}
              </Button>
            </div>
            {linkError && <p className="text-xs text-red-400">{linkError}</p>}

            {/* Active share links */}
            <div className="space-y-2">
              {linksLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : shareLinks.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-3">No active share links</p>
              ) : (
                shareLinks.map(link => (
                  <ShareLinkCard key={link.id} link={link} onRevoke={revokeShareLink} />
                ))
              )}
            </div>

            <p className="text-[10px] text-slate-600">
              TODO: <code className="font-mono">/share/:token</code> route not yet implemented — links compose the correct URL but will 404 until Agent R or a future pass wires the public share view.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
