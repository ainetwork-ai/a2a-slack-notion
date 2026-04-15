'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, ChevronDown, ChevronRight, Bot, Zap, UserPlus, Wrench, FlaskConical } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';
import useSWR, { useSWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Agent {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  status: 'online' | 'offline' | 'busy';
  conversationId?: string;
}

export default function AgentList() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { setAgentInviteOpen, setAgentBuildOpen, setTestAgent } = useAppStore();
  const { mutate } = useSWRConfig();

  const { data } = useSWR<Agent[]>(
    '/api/agents',
    fetcher,
    { refreshInterval: 10000 }
  );

  const agents = (data ?? []).map(a => ({
    ...a,
    name: (a as unknown as { displayName: string }).displayName || a.name,
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
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={async () => {
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
              }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left group/agent',
                isActive(agent.conversationId)
                  ? 'bg-[#4a154b]/60 text-white'
                  : 'text-[#bcabbc] hover:bg-white/5 hover:text-white'
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="w-6 h-6">
                  {agent.iconUrl && <AvatarImage src={agent.iconUrl} alt={agent.name} />}
                  <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTestAgent({ id: agent.id, name: agent.name });
                }}
                className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/agent:opacity-100 hover:bg-white/10 transition-all shrink-0"
                title={`Test ${agent.name}`}
              >
                <FlaskConical className="w-3 h-3 text-[#36c5f0]" />
              </button>
              <Zap className="w-3 h-3 text-[#36c5f0] opacity-70 shrink-0 group-hover/agent:hidden" />
            </button>
          ))}

          <button
            onClick={() => setAgentInviteOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite agent</span>
          </button>
          <button
            onClick={() => setAgentBuildOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[#bcabbc] hover:text-white hover:bg-white/5 transition-colors"
          >
            <Wrench className="w-4 h-4" />
            <span>Build agent</span>
          </button>
        </div>
      )}
    </div>
  );
}
