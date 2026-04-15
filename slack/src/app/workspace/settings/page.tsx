'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import { Loader2, Settings, Users, Hash, Calendar, Shield, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  userId: string;
  role: string;
  joinedAt: string;
  displayName: string;
  avatarUrl?: string;
  ainAddress: string;
  isAgent: boolean;
  status: string;
}

interface SettingsData {
  members: Member[];
  channelCount: number;
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: 'bg-[#4a154b]/40 text-[#e879f9] border border-[#4a154b]/60',
    admin: 'bg-blue-900/40 text-blue-300 border border-blue-800/60',
    member: 'bg-white/5 text-slate-400 border border-white/10',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', styles[role] ?? styles.member)}>
      {role}
    </span>
  );
}

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, fetchWorkspaces } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const myRole = activeWorkspace?.role ?? 'member';
  const isPrivileged = myRole === 'owner' || myRole === 'admin';

  const [data, setData] = useState<SettingsData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Member removal
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members`);
      if (!res.ok) throw new Error('Failed to load workspace data');
      const json: SettingsData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingData(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setDescription(activeWorkspace.description ?? '');
      setIconUrl(activeWorkspace.iconUrl ?? '');
    }
  }, [activeWorkspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Redirect non-privileged users
  useEffect(() => {
    if (!loadingData && activeWorkspace && !isPrivileged) {
      router.replace('/workspace');
    }
  }, [loadingData, activeWorkspace, isPrivileged, router]);

  async function handleSave() {
    if (!activeWorkspaceId) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), iconUrl: iconUrl.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save');
      await fetchWorkspaces();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('Failed to save workspace settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!activeWorkspaceId) return;
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to remove member');
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRemovingId(null);
    }
  }

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const createdAt = activeWorkspace
    ? new Date((activeWorkspace as { createdAt?: string }).createdAt ?? Date.now()).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#4a154b]/30 border border-[#4a154b]/40 flex items-center justify-center">
            <Settings className="w-5 h-5 text-[#e879f9]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Workspace Settings</h1>
            <p className="text-slate-400 text-sm">Manage your workspace configuration</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Workspace Info */}
        <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold text-white">General</h2>
          </div>
          <div className="px-5 py-5 space-y-4">
            {/* Stats row */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Users className="w-4 h-4" />
                <span>{data?.members.length ?? '–'} members</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Hash className="w-4 h-4" />
                <span>{data?.channelCount ?? '–'} channels</span>
              </div>
              {createdAt && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>Created {createdAt}</span>
                </div>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Workspace Name
              </label>
              <input
                className="w-full bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b] disabled:opacity-50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isPrivileged || saving}
                placeholder="Workspace name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Description
              </label>
              <textarea
                className="w-full bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b] resize-none disabled:opacity-50"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isPrivileged || saving}
                placeholder="Describe your workspace (optional)"
              />
            </div>

            {/* Icon URL */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Workspace Icon URL
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#4a154b]/30 border border-[#4a154b]/40 shrink-0 overflow-hidden">
                  {iconUrl ? (
                    <Image
                      src={iconUrl}
                      alt="Workspace icon"
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <span className="text-white font-bold text-xs">
                      {activeWorkspace?.iconText ?? 'WS'}
                    </span>
                  )}
                </div>
                <input
                  className="flex-1 bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b] disabled:opacity-50"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  disabled={!isPrivileged || saving}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Paste an image URL to use as the workspace icon in the sidebar.
              </p>
            </div>

            {isPrivileged && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="px-4 py-2 bg-[#4a154b] hover:bg-[#611f6a] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
                {saveSuccess && (
                  <span className="text-green-400 text-sm">Saved successfully</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Members */}
        <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Members</h2>
          </div>

          {loadingData ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {(data?.members ?? []).map((member) => {
                const initials = member.displayName
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);
                const isMe = member.userId === user?.id;
                const canRemove =
                  isPrivileged &&
                  !isMe &&
                  member.role !== 'owner';

                return (
                  <li key={member.userId} className="flex items-center gap-3 px-5 py-3">
                    <div className="relative shrink-0">
                      <Avatar className="w-8 h-8">
                        {member.avatarUrl && (
                          <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                        )}
                        <AvatarFallback className="bg-[#4a154b] text-white text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {member.displayName}
                        </span>
                        {isMe && (
                          <span className="text-xs text-slate-500">(you)</span>
                        )}
                        {member.isAgent && (
                          <span className="text-xs text-[#36c5f0]">agent</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {member.ainAddress.slice(0, 8)}…{member.ainAddress.slice(-4)}
                      </div>
                    </div>
                    <RoleBadge role={member.role} />
                    {canRemove && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${member.displayName} from this workspace?`)) {
                            handleRemoveMember(member.userId);
                          }
                        }}
                        disabled={removingId === member.userId}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        title="Remove member"
                      >
                        {removingId === member.userId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
