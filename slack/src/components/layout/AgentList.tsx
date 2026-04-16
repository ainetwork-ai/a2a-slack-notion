'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, ChevronDown, ChevronRight, Bot, Zap, UserPlus, Wrench, FlaskConical, Settings, Pencil } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';
import useSWR, { useSWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Agent {
  id: string;
  displayName?: string;
  name?: string;
  description?: string;
  iconUrl?: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'busy';
  conversationId?: string;
  a2aUrl?: string;
  agentVisibility?: 'public' | 'private' | 'unlisted';
  agentCategory?: string;
  isMine?: boolean;
}

type Tab = 'workspace' | 'mine' | 'browse';

export default function AgentList() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<Tab>('workspace');
  const { setAgentInviteOpen, setTestAgent, setAgentEditId } = useAppStore();
  const [openingBuilder, setOpeningBuilder] = useState(false);

  async function openBuilderDM() {
    if (openingBuilder) return;
    setOpeningBuilder(true);
    try {
      const builderRes = await fetch('/api/agents/builder');
      if (!builderRes.ok) {
        alert('Failed to open Builder agent');
        return;
      }
      const builder = await builderRes.json();
      const dmRes = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [builder.id] }),
      });
      if (!dmRes.ok) {
        alert('Failed to start DM with Builder');
        return;
      }
      const conv = await dmRes.json();
      mutate('/api/dm');
      mutate('/api/agents');
      router.push(`/workspace/dm/${conv.id}`);
    } finally {
      setOpeningBuilder(false);
    }
  }
  const { mutate } = useSWRConfig();

  const endpoint =
    tab === 'workspace'
      ? '/api/agents'
      : `/api/agents/registry?tab=${tab === 'mine' ? 'mine' : 'public'}`;

  const { data, mutate: mutateList } = useSWR<Agent[]>(endpoint, fetcher, {
    refreshInterval: 10000,
  });

  const agents = (data ?? []).map(a => ({
    ...a,
    name: a.displayName || a.name || 'Unnamed',
    iconUrl: a.iconUrl || a.avatarUrl,
  }));

  function isActive(conversationId?: string) {
    if (!conversationId) return false;
    return pathname === `/workspace/dm/${conversationId}`;
  }

  const statusColors = {
    online: 'bg-green-400',
    offline: 'bg-slate-500',
    busy: 'bg-yellow-400',
  };

  async function handleOpenDm(agent: Agent) {
    const res = await fetch('/api/dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: [agent.id] }),
    });
    if (res.ok) {
      const conv = await res.json();
      mutate('/api/dm');
      router.push(`/workspace/dm/${conv.id}`);
    }
  }

  async function handleInviteFromRegistry(agent: Agent) {
    if (!agent.a2aUrl) return;
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a2aUrl: agent.a2aUrl }),
    });
    if (res.ok) {
      mutate('/api/agents');
      mutateList();
      setTab('workspace');
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'workspace', label: 'Workspace' },
    { key: 'mine', label: 'Mine' },
    { key: 'browse', label: 'Browse' },
  ];

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-2 py-1 group">
        <button
          className="flex items-center gap-1 text-[#bcabbc] hover:text-white text-sm font-semibold transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          Agents
        </button>
        <button
          onClick={() => setAgentInviteOpen(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#bcabbc] hover:text-white p-0.5 rounded"
          title="Invite an agent"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-0.5 space-y-px">
          {/* Tabs */}
          <div className="flex gap-0.5 px-1 pb-1 text-[11px]">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex-1 px-1.5 py-0.5 rounded transition-colors',
                  tab === t.key
                    ? 'bg-white/10 text-white'
                    : 'text-[#bcabbc] hover:text-white hover:bg-white/5'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {agents.length === 0 && (
            <div className="px-2 py-2 text-[11px] text-[#bcabbc]/70 italic">
              {tab === 'mine'
                ? 'No agents invited by you yet.'
                : tab === 'browse'
                ? 'No public agents yet.'
                : 'No agents in this workspace.'}
            </div>
          )}

          {agents.map(agent => {
            const isBrowse = tab === 'browse';
            return (
              <div
                key={agent.id}
                onClick={() => (isBrowse ? handleInviteFromRegistry(agent) : handleOpenDm(agent))}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer group/agent',
                  isActive(agent.conversationId)
                    ? 'bg-[#4a154b]/60 text-white'
                    : 'text-[#bcabbc] hover:bg-white/5 hover:text-white'
                )}
                title={isBrowse ? 'Click to invite to this workspace' : `DM ${agent.name}`}
              >
                <div className="relative shrink-0">
                  <Avatar className="w-6 h-6">
                    {agent.iconUrl && <AvatarImage src={agent.iconUrl} alt={agent.name} />}
                    <AvatarFallback className="bg-[#1d9bd1]/20 text-[#1d9bd1]">
                      <Bot className="w-3.5 h-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1a1d21]',
                      statusColors[agent.status]
                    )}
                  />
                </div>
                <span className="truncate flex-1">{agent.name}</span>
                {tab === 'mine' && agent.agentVisibility === 'public' && (
                  <span
                    className="text-[10px] px-1 rounded bg-[#1d9bd1]/20 text-[#1d9bd1] shrink-0"
                    title="Public in registry"
                  >
                    🌐
                  </span>
                )}
                {!isBrowse && (
                  <>
                    {agent.isMine && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgentEditId(agent.id);
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/agent:opacity-100 hover:bg-white/10 transition-all shrink-0"
                        title={`Edit ${agent.name}`}
                      >
                        <Pencil className="w-3 h-3 text-[#bcabbc]" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTestAgent({ id: agent.id, name: agent.name! });
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/agent:opacity-100 hover:bg-white/10 transition-all shrink-0"
                      title={`Test ${agent.name}`}
                    >
                      <FlaskConical className="w-3 h-3 text-[#1d9bd1]" />
                    </button>
                  </>
                )}
                {isBrowse ? (
                  <UserPlus className="w-3.5 h-3.5 text-[#1d9bd1] opacity-70 shrink-0" />
                ) : (
                  <Zap className="w-3 h-3 text-[#1d9bd1] opacity-70 shrink-0 group-hover/agent:hidden" />
                )}
              </div>
            );
          })}

          <button
            onClick={() => setAgentInviteOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite agent</span>
          </button>
          <button
            onClick={openBuilderDM}
            disabled={openingBuilder}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <Wrench className="w-4 h-4" />
            <span>{openingBuilder ? 'Opening Builder…' : 'Build agent'}</span>
          </button>
          {tab === 'mine' && (
            <button
              onClick={() => router.push(`/workspace/settings/agents`)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Manage agents</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
