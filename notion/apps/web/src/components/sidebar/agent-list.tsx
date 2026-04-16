'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, Plus, Circle } from 'lucide-react';
import { AgentInviteModal } from '@/components/agent/agent-invite-modal';

interface AgentItem {
  id: string;
  name: string;
  image: string | null;
  agentStatus: string | null;
}

interface AgentListProps {
  workspaceId: string;
}

export function AgentList({ workspaceId }: AgentListProps) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const apiUrl =
    typeof window !== 'undefined'
      ? (process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`)
      : 'http://localhost:3011';

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/agents?workspace_id=${encodeURIComponent(workspaceId)}`, {
        credentials: 'include',
      });
      if (res.ok) setAgents((await res.json()) as AgentItem[]);
    } catch {
      /* ignore */
    }
  }, [apiUrl, workspaceId]);

  useEffect(() => {
    loadAgents().catch(() => {});
  }, [loadAgents]);

  return (
    <>
      <div className="mt-4 px-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Agents</span>
          <button
            onClick={() => setModalOpen(true)}
            className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            title="Add Agent"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {agents.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] px-2 py-1">No agents added yet</p>
        ) : (
          <div className="space-y-0.5">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] cursor-default"
              >
                <div className="relative shrink-0">
                  {agent.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agent.image} alt="" className="w-5 h-5 rounded" />
                  ) : (
                    <Bot className="w-5 h-5 text-[var(--accent-blue)]" />
                  )}
                  <Circle
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5"
                    fill={agent.agentStatus === 'online' ? '#4caf50' : '#9e9e9e'}
                    stroke="var(--bg-default)"
                    strokeWidth={2}
                  />
                </div>
                <span className="text-sm text-[var(--text-primary)] truncate">{agent.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AgentInviteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
        onAgentAdded={loadAgents}
      />
    </>
  );
}
