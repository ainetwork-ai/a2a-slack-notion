'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import { Loader2, Settings, Users, Hash, Calendar, Shield, Trash2, AlertCircle, Terminal, Plus, Download, Webhook, Copy, Check, ArrowUpRight, Globe } from 'lucide-react';
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
  const { workspaces, activeWorkspaceName, fetchWorkspaces } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.name === activeWorkspaceName);
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

  // Role management
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  // Webhooks
  interface Webhook {
    id: string;
    name: string;
    token: string;
    channelId: string;
    channelName: string;
    createdAt: string;
  }
  interface Channel {
    id: string;
    name: string;
  }
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [webhookChannels, setWebhookChannels] = useState<Channel[]>([]);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookChannelId, setNewWebhookChannelId] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [removingWebhookId, setRemovingWebhookId] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Outgoing Webhooks
  interface OutgoingWebhook {
    id: string;
    name: string;
    triggerWords: string;
    url: string;
    channelId: string | null;
    channelName: string | null;
    createdAt: string;
  }
  const [outgoingWebhooks, setOutgoingWebhooks] = useState<OutgoingWebhook[]>([]);
  const [loadingOutgoing, setLoadingOutgoing] = useState(false);
  const [newOutgoingName, setNewOutgoingName] = useState('');
  const [newOutgoingTrigger, setNewOutgoingTrigger] = useState('');
  const [newOutgoingUrl, setNewOutgoingUrl] = useState('');
  const [newOutgoingChannelId, setNewOutgoingChannelId] = useState('');
  const [savingOutgoing, setSavingOutgoing] = useState(false);
  const [removingOutgoingId, setRemovingOutgoingId] = useState<string | null>(null);
  const [outgoingError, setOutgoingError] = useState<string | null>(null);

  // Workspace Defaults
  const [defaultNotifPref, setDefaultNotifPref] = useState('all');
  const [defaultChannelIds, setDefaultChannelIds] = useState<string[]>([]);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!activeWorkspaceName) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceName)}/export`);
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeWorkspace?.name ?? 'workspace'}-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export workspace data');
    } finally {
      setExporting(false);
    }
  }

  // Custom commands
  interface CustomCommand {
    id: string;
    name: string;
    description: string;
    responseText: string;
  }
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdDescription, setNewCmdDescription] = useState('');
  const [newCmdResponse, setNewCmdResponse] = useState('');
  const [savingCmd, setSavingCmd] = useState(false);
  const [removingCmdId, setRemovingCmdId] = useState<string | null>(null);
  const [cmdError, setCmdError] = useState<string | null>(null);

  const loadCustomCommands = useCallback(async () => {
    if (!activeWorkspaceName) return;
    setLoadingCommands(true);
    try {
      const res = await fetch(`/api/commands?workspaceId=${encodeURIComponent(activeWorkspaceName)}`);
      if (res.ok) setCustomCommands(await res.json());
    } finally {
      setLoadingCommands(false);
    }
  }, [activeWorkspaceName]);

  useEffect(() => {
    if (isPrivileged) loadCustomCommands();
  }, [isPrivileged, loadCustomCommands]);

  const loadWebhooks = useCallback(async () => {
    if (!activeWorkspaceName) return;
    setLoadingWebhooks(true);
    try {
      const res = await fetch(`/api/webhooks?workspaceId=${encodeURIComponent(activeWorkspaceName)}`);
      if (res.ok) setWebhooks(await res.json());
    } finally {
      setLoadingWebhooks(false);
    }
  }, [activeWorkspaceName]);

  const loadWebhookChannels = useCallback(async () => {
    if (!activeWorkspaceName) return;
    try {
      const res = await fetch(`/api/channels?workspaceId=${encodeURIComponent(activeWorkspaceName)}`);
      if (res.ok) {
        const data = await res.json();
        // channels API returns [{channel: {...}, ...}, ...]
        const list: Channel[] = Array.isArray(data)
          ? data
              .map((row: { channel?: { id: string; name: string } }) => row.channel ?? row)
              .filter((c): c is Channel => !!(c && (c as Channel).id && (c as Channel).name))
          : [];
        setWebhookChannels(list);
      }
    } catch {
      // ignore
    }
  }, [activeWorkspaceName]);

  useEffect(() => {
    if (isPrivileged) {
      loadWebhooks();
      loadWebhookChannels();
    }
  }, [isPrivileged, loadWebhooks, loadWebhookChannels]);

  async function handleAddWebhook() {
    if (!activeWorkspaceName || !newWebhookName.trim() || !newWebhookChannelId) return;
    setSavingWebhook(true);
    setWebhookError(null);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspaceName,
          channelId: newWebhookChannelId,
          name: newWebhookName.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setWebhookError(body.error ?? 'Failed to create webhook');
      } else {
        setNewWebhookName('');
        setNewWebhookChannelId('');
        await loadWebhooks();
      }
    } catch {
      setWebhookError('Failed to create webhook');
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleRemoveWebhook(id: string) {
    if (!activeWorkspaceName) return;
    setRemovingWebhookId(id);
    try {
      await fetch('/api/webhooks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId: activeWorkspaceName }),
      });
      await loadWebhooks();
    } finally {
      setRemovingWebhookId(null);
    }
  }

  function handleCopyWebhookUrl(token: string) {
    const url = `${window.location.origin}/api/webhooks/incoming/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  const loadOutgoingWebhooks = useCallback(async () => {
    if (!activeWorkspaceName) return;
    setLoadingOutgoing(true);
    try {
      const res = await fetch(`/api/webhooks/outgoing?workspaceId=${encodeURIComponent(activeWorkspaceName)}`);
      if (res.ok) setOutgoingWebhooks(await res.json());
    } finally {
      setLoadingOutgoing(false);
    }
  }, [activeWorkspaceName]);

  useEffect(() => {
    if (isPrivileged) loadOutgoingWebhooks();
  }, [isPrivileged, loadOutgoingWebhooks]);

  async function handleAddOutgoingWebhook() {
    if (!activeWorkspaceName || !newOutgoingName.trim() || !newOutgoingTrigger.trim() || !newOutgoingUrl.trim()) return;
    setSavingOutgoing(true);
    setOutgoingError(null);
    try {
      const res = await fetch('/api/webhooks/outgoing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspaceName,
          channelId: newOutgoingChannelId || undefined,
          name: newOutgoingName.trim(),
          triggerWords: newOutgoingTrigger.trim(),
          url: newOutgoingUrl.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setOutgoingError(body.error ?? 'Failed to create outgoing webhook');
      } else {
        setNewOutgoingName('');
        setNewOutgoingTrigger('');
        setNewOutgoingUrl('');
        setNewOutgoingChannelId('');
        await loadOutgoingWebhooks();
      }
    } catch {
      setOutgoingError('Failed to create outgoing webhook');
    } finally {
      setSavingOutgoing(false);
    }
  }

  async function handleRemoveOutgoingWebhook(id: string) {
    if (!activeWorkspaceName) return;
    setRemovingOutgoingId(id);
    try {
      await fetch('/api/webhooks/outgoing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId: activeWorkspaceName }),
      });
      await loadOutgoingWebhooks();
    } finally {
      setRemovingOutgoingId(null);
    }
  }

  async function handleSaveDefaults() {
    if (!activeWorkspaceName) return;
    setSavingDefaults(true);
    setDefaultsSaved(false);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultNotificationPref: defaultNotifPref, defaultChannels: defaultChannelIds }),
      });
      if (!res.ok) throw new Error('Failed to save defaults');
      setDefaultsSaved(true);
      setTimeout(() => setDefaultsSaved(false), 3000);
    } catch {
      setError('Failed to save workspace defaults');
    } finally {
      setSavingDefaults(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    if (!activeWorkspaceName) return;
    setUpdatingRoleId(userId);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceName)}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'Failed to update role');
      } else {
        await loadData();
      }
    } catch {
      setError('Failed to update role');
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function handleAddCommand() {
    if (!activeWorkspaceName || !newCmdName.trim() || !newCmdResponse.trim()) return;
    setSavingCmd(true);
    setCmdError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspaceName,
          name: newCmdName.trim(),
          description: newCmdDescription.trim(),
          responseText: newCmdResponse.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setCmdError(body.error ?? 'Failed to create command');
      } else {
        setNewCmdName('');
        setNewCmdDescription('');
        setNewCmdResponse('');
        await loadCustomCommands();
      }
    } catch {
      setCmdError('Failed to create command');
    } finally {
      setSavingCmd(false);
    }
  }

  async function handleRemoveCommand(id: string) {
    if (!activeWorkspaceName) return;
    setRemovingCmdId(id);
    try {
      await fetch('/api/commands', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, workspaceId: activeWorkspaceName }),
      });
      await loadCustomCommands();
    } finally {
      setRemovingCmdId(null);
    }
  }

  const loadData = useCallback(async () => {
    if (!activeWorkspaceName) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceName)}/members`);
      if (!res.ok) throw new Error('Failed to load workspace data');
      const json: SettingsData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingData(false);
    }
  }, [activeWorkspaceName]);

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name);
      setDescription(activeWorkspace.description ?? '');
      setIconUrl(activeWorkspace.iconUrl ?? '');
      const ws = activeWorkspace as unknown as { defaultNotificationPref?: string; defaultChannels?: string[] };
      setDefaultNotifPref(ws.defaultNotificationPref ?? 'all');
      setDefaultChannelIds(ws.defaultChannels ?? []);
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
    if (!activeWorkspaceName) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceName)}`, {
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
    if (!activeWorkspaceName) return;
    setRemovingId(userId);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceName)}/members`, {
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
                    {myRole === 'owner' && member.role !== 'owner' && !isMe ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                        disabled={updatingRoleId === member.userId}
                        className="bg-[#1a1d21] border border-white/10 rounded text-xs text-slate-300 px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#4a154b] disabled:opacity-50"
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                    {updatingRoleId === member.userId && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    )}
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
        {/* Custom Commands */}
        {isPrivileged && (
          <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Custom Commands</h2>
            </div>

            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-slate-500">
                Create custom slash commands that respond with a fixed message. Use them in any channel with <span className="font-mono text-slate-400">/commandname</span>.
              </p>

              {cmdError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {cmdError}
                </div>
              )}

              {/* Add new command form */}
              <div className="space-y-2 p-4 bg-[#1a1d21] border border-white/5 rounded-lg">
                <p className="text-xs font-medium text-slate-400 mb-3">Add new command</p>
                <div className="flex gap-2">
                  <div className="flex items-center bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-slate-400 text-sm shrink-0">
                    /
                  </div>
                  <input
                    className="flex-1 bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
                    value={newCmdName}
                    onChange={(e) => setNewCmdName(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())}
                    placeholder="command-name"
                    disabled={savingCmd}
                  />
                </div>
                <input
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
                  value={newCmdDescription}
                  onChange={(e) => setNewCmdDescription(e.target.value)}
                  placeholder="Short description (optional)"
                  disabled={savingCmd}
                />
                <textarea
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b] resize-none"
                  rows={2}
                  value={newCmdResponse}
                  onChange={(e) => setNewCmdResponse(e.target.value)}
                  placeholder="Response text when command is run"
                  disabled={savingCmd}
                />
                <button
                  onClick={handleAddCommand}
                  disabled={savingCmd || !newCmdName.trim() || !newCmdResponse.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingCmd ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Add Command
                </button>
              </div>

              {/* Existing commands list */}
              {loadingCommands ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                </div>
              ) : customCommands.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-3">No custom commands yet.</p>
              ) : (
                <ul className="space-y-2">
                  {customCommands.map((cmd) => (
                    <li key={cmd.id} className="flex items-start gap-3 p-3 bg-[#1a1d21] border border-white/5 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-medium text-[#e879f9]">/{cmd.name}</span>
                          {cmd.description && (
                            <span className="text-xs text-slate-500 truncate">{cmd.description}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{cmd.responseText}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remove /${cmd.name}?`)) handleRemoveCommand(cmd.id);
                        }}
                        disabled={removingCmdId === cmd.id}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50 shrink-0"
                        title="Remove command"
                      >
                        {removingCmdId === cmd.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Incoming Webhooks */}
        {isPrivileged && (
          <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Incoming Webhooks</h2>
            </div>

            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-slate-500">
                Generate webhook URLs that allow external services to post messages to a channel.
              </p>

              {webhookError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {webhookError}
                </div>
              )}

              {/* Add new webhook form */}
              <div className="space-y-2 p-4 bg-[#1a1d21] border border-white/5 rounded-lg">
                <p className="text-xs font-medium text-slate-400 mb-3">Add new webhook</p>
                <input
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  placeholder="Webhook name (e.g. CI Notifications)"
                  disabled={savingWebhook}
                />
                <select
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#4a154b] disabled:opacity-50"
                  value={newWebhookChannelId}
                  onChange={(e) => setNewWebhookChannelId(e.target.value)}
                  disabled={savingWebhook}
                >
                  <option value="">Select a channel…</option>
                  {webhookChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddWebhook}
                  disabled={savingWebhook || !newWebhookName.trim() || !newWebhookChannelId}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingWebhook ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Create Webhook
                </button>
              </div>

              {/* Existing webhooks list */}
              {loadingWebhooks ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                </div>
              ) : webhooks.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-3">No webhooks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {webhooks.map((wh) => {
                    const webhookUrl = typeof window !== 'undefined'
                      ? `${window.location.origin}/api/webhooks/incoming/${wh.token}`
                      : `/api/webhooks/incoming/${wh.token}`;
                    return (
                      <li key={wh.id} className="flex items-start gap-3 p-3 bg-[#1a1d21] border border-white/5 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{wh.name}</span>
                            <span className="text-xs text-slate-500">#{wh.channelName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <code className="text-xs text-slate-400 font-mono truncate max-w-xs">{webhookUrl}</code>
                            <button
                              onClick={() => handleCopyWebhookUrl(wh.token)}
                              className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                              title="Copy URL"
                            >
                              {copiedToken === wh.token ? (
                                <Check className="w-3 h-3 text-green-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Delete webhook "${wh.name}"?`)) handleRemoveWebhook(wh.id);
                          }}
                          disabled={removingWebhookId === wh.id}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50 shrink-0"
                          title="Delete webhook"
                        >
                          {removingWebhookId === wh.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Outgoing Webhooks */}
        {isPrivileged && (
          <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Outgoing Webhooks</h2>
            </div>

            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-slate-500">
                Trigger HTTP POST requests to external URLs when messages match certain trigger words. The message must start with the trigger word.
              </p>

              {outgoingError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {outgoingError}
                </div>
              )}

              <div className="space-y-2 p-4 bg-[#1a1d21] border border-white/5 rounded-lg">
                <p className="text-xs font-medium text-slate-400 mb-3">Add new outgoing webhook</p>
                <input
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
                  value={newOutgoingName}
                  onChange={(e) => setNewOutgoingName(e.target.value)}
                  placeholder="Webhook name (e.g. Alert Bot)"
                  disabled={savingOutgoing}
                />
                <input
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
                  value={newOutgoingTrigger}
                  onChange={(e) => setNewOutgoingTrigger(e.target.value)}
                  placeholder="Trigger words, comma-separated (e.g. !alert, !deploy)"
                  disabled={savingOutgoing}
                />
                <input
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[#4a154b]"
                  value={newOutgoingUrl}
                  onChange={(e) => setNewOutgoingUrl(e.target.value)}
                  placeholder="URL to POST to (e.g. https://example.com/hook)"
                  disabled={savingOutgoing}
                />
                <select
                  className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#4a154b] disabled:opacity-50"
                  value={newOutgoingChannelId}
                  onChange={(e) => setNewOutgoingChannelId(e.target.value)}
                  disabled={savingOutgoing}
                >
                  <option value="">All channels</option>
                  {webhookChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddOutgoingWebhook}
                  disabled={savingOutgoing || !newOutgoingName.trim() || !newOutgoingTrigger.trim() || !newOutgoingUrl.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a154b] hover:bg-[#611f6a] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingOutgoing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Create Outgoing Webhook
                </button>
              </div>

              {loadingOutgoing ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                </div>
              ) : outgoingWebhooks.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-3">No outgoing webhooks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {outgoingWebhooks.map((wh) => (
                    <li key={wh.id} className="flex items-start gap-3 p-3 bg-[#1a1d21] border border-white/5 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{wh.name}</span>
                          {wh.channelName ? (
                            <span className="text-xs text-slate-500">#{wh.channelName}</span>
                          ) : (
                            <span className="text-xs text-slate-600">all channels</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          <span className="text-slate-500">Triggers: </span>
                          <span className="font-mono">{wh.triggerWords}</span>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">{wh.url}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Delete outgoing webhook "${wh.name}"?`)) handleRemoveOutgoingWebhook(wh.id);
                        }}
                        disabled={removingOutgoingId === wh.id}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50 shrink-0"
                        title="Delete webhook"
                      >
                        {removingOutgoingId === wh.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Workspace Defaults */}
        {isPrivileged && (
          <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Workspace Defaults</h2>
            </div>

            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-slate-500">
                Configure default settings applied to new members when they join this workspace.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Default Notification Preference
                </label>
                <select
                  className="w-full bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#4a154b] disabled:opacity-50"
                  value={defaultNotifPref}
                  onChange={(e) => setDefaultNotifPref(e.target.value)}
                  disabled={savingDefaults}
                >
                  <option value="all">All messages</option>
                  <option value="mentions">Mentions only</option>
                  <option value="none">None</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">New members will have this notification preference set for channels they join automatically.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Default Channels
                </label>
                <p className="text-xs text-slate-500 mb-2">New members will be automatically added to these channels.</p>
                <div className="space-y-1.5">
                  {webhookChannels.map((ch) => (
                    <label key={ch.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="rounded border-white/20 bg-[#1a1d21] text-[#4a154b] focus:ring-[#4a154b] focus:ring-offset-0"
                        checked={defaultChannelIds.includes(ch.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setDefaultChannelIds((prev) => [...prev, ch.id]);
                          } else {
                            setDefaultChannelIds((prev) => prev.filter((id) => id !== ch.id));
                          }
                        }}
                        disabled={savingDefaults}
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">#{ch.name}</span>
                    </label>
                  ))}
                  {webhookChannels.length === 0 && (
                    <p className="text-xs text-slate-600">No channels available.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveDefaults}
                  disabled={savingDefaults}
                  className="px-4 py-2 bg-[#4a154b] hover:bg-[#611f6a] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDefaults ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    'Save Defaults'
                  )}
                </button>
                {defaultsSaved && (
                  <span className="text-green-400 text-sm">Saved successfully</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Export Data */}
        {isPrivileged && (
          <section className="bg-[#222529] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
              <Download className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Export Data</h2>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className="text-xs text-slate-500">
                Download a full JSON export of your workspace data including channels, messages, members, and file metadata.
              </p>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-[#4a154b] hover:bg-[#611f6a] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Exporting…
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Export Data
                  </>
                )}
              </button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
