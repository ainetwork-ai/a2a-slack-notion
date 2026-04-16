'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Copy, Check, UserPlus, Users, Settings, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WorkspaceModal({ open, onOpenChange }: WorkspaceModalProps) {
  const [tab, setTab] = useState<'info' | 'invite' | 'members'>('info');
  const [copied, setCopied] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const { activeWorkspaceName, workspaces } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.name === activeWorkspaceName);
  const activeWorkspaceId = activeWorkspace?.id ?? null;

  // Fetch workspace members from /api/workspaces/[name] for member count
  const { data: wsDetail } = useSWR(
    open && activeWorkspaceName
      ? `/api/workspaces/${encodeURIComponent(activeWorkspaceName)}`
      : null,
    fetcher
  );

  // Fetch all users for members tab
  const { data: users } = useSWR(open && tab === 'members' ? '/api/users' : null, fetcher);
  const allUsers = Array.isArray(users) ? users : [];

  async function handleGenerateLink() {
    setIsGeneratingLink(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        setInviteLink(data.link);
      }
    } catch {
      // fail silently
    } finally {
      setIsGeneratingLink(false);
    }
  }

  function handleCopyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tabs = [
    { id: 'info' as const, label: 'Info', icon: <Settings className="w-4 h-4" /> },
    { id: 'invite' as const, label: 'Invite', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'members' as const, label: 'Members', icon: <Users className="w-4 h-4" /> },
  ];

  const workspaceName = activeWorkspace?.name ?? 'Slack-A2A';
  const workspaceIcon = activeWorkspace?.iconText ?? 'A2A';
  const workspaceDescription = activeWorkspace?.description ?? 'Agent-to-Agent communication on AIN blockchain';
  const memberCount = wsDetail?.memberCount ?? allUsers.filter((u: { isAgent?: boolean }) => !u.isAgent).length;
  const agentCount = allUsers.filter((u: { isAgent?: boolean }) => u.isAgent).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">{workspaceName} Workspace</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 pb-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-[#4a154b] text-white'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-h-[200px]">
          {/* Info tab */}
          {tab === 'info' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#4a154b] flex items-center justify-center text-white text-2xl font-bold">
                  {workspaceIcon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{workspaceName}</h3>
                  <p className="text-sm text-slate-400">{workspaceDescription}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-[#222529] rounded-lg p-3">
                  <p className="text-slate-400">Members</p>
                  <p className="text-white text-lg font-semibold">{memberCount}</p>
                </div>
                <div className="bg-[#222529] rounded-lg p-3">
                  <p className="text-slate-400">Agents</p>
                  <p className="text-white text-lg font-semibold">{agentCount}</p>
                </div>
              </div>
              <div className="bg-[#222529] rounded-lg p-3">
                <p className="text-slate-400 text-sm mb-1">Invite Link</p>
                {inviteLink ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-slate-300 bg-black/30 px-2 py-1 rounded truncate">{inviteLink}</code>
                    <Button size="sm" variant="ghost" onClick={handleCopyLink} className="text-slate-400 hover:text-white shrink-0">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={handleGenerateLink} disabled={isGeneratingLink} className="bg-[#4a154b] hover:bg-[#611f6a] text-white">
                    {isGeneratingLink ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating...</> : 'Generate Invite Link'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Invite tab */}
          {tab === 'invite' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Share the invite link to add people to this workspace.
              </p>

              <div className="bg-[#222529] rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-white">Quick invite via link</p>
                {inviteLink ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-slate-300 bg-black/30 px-2 py-1 rounded truncate">{inviteLink}</code>
                    <Button size="sm" onClick={handleCopyLink} className="bg-[#4a154b] hover:bg-[#611f6a] text-white shrink-0">
                      {copied ? <><Check className="w-3 h-3 mr-1" />Copied</> : <><Copy className="w-3 h-3 mr-1" />Copy</>}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={handleGenerateLink} disabled={isGeneratingLink} className="bg-[#4a154b] hover:bg-[#611f6a] text-white">
                    {isGeneratingLink ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating...</> : 'Generate Invite Link'}
                  </Button>
                )}
                <p className="text-xs text-slate-500">Link expires in 7 days</p>
              </div>

            </div>
          )}

          {/* Members tab */}
          {tab === 'members' && (
            <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-slack">
              {allUsers.map((user: { id: string; displayName: string; avatarUrl?: string; isAgent?: boolean; status?: string; ainAddress?: string }) => {
                const initials = user.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
                return (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-[#4a154b] text-white text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">{user.displayName}</span>
                        {user.isAgent && (
                          <span className="text-[10px] bg-[#36c5f0]/20 text-[#36c5f0] px-1.5 py-0.5 rounded">Bot</span>
                        )}
                      </div>
                      {user.ainAddress && (
                        <p className="text-[11px] text-slate-500 truncate">{user.ainAddress}</p>
                      )}
                    </div>
                    <span className={`w-2 h-2 rounded-full ${user.status === 'online' ? 'bg-green-400' : 'bg-slate-500'}`} />
                  </div>
                );
              })}
              {allUsers.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">No members yet</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
