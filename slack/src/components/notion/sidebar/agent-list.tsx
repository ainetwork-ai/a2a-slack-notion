'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, Plus, Circle, X } from 'lucide-react';
import { AgentInviteModal } from '@/components/notion/agent/agent-invite-modal';
import { AgentProfilePopup } from '@/components/agents/AgentProfilePopup';
import { ListSkeleton } from './list-skeleton';

/**
 * Notion sidebar agent list — uses the unified `/api/v1/agents` endpoint
 * (which is a thin wrapper around Slack's `/api/agents` so both UIs see
 * the same set of agents byte-for-byte). Clicking a row opens the shared
 * `AgentProfilePopup` (the same component Slack's MessageItem uses).
 */
interface AgentItem {
  id: string;
  // Both shape variants returned by the unified endpoint:
  displayName?: string;
  name?: string;
  avatarUrl?: string | null;
  image?: string | null;
  status?: string;
  agentStatus?: string | null;
  a2aId?: string | null;
  agentCardJson?: unknown;
}

interface AgentListProps {
  workspaceId: string;
}

export function AgentList({ workspaceId }: AgentListProps) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Same-origin — the Notion API lives at /api/v1/* in this merged Next.js app.
  const apiUrl = '';

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/agents?workspace_id=${encodeURIComponent(workspaceId)}`, {
        credentials: 'include',
      });
      if (res.ok) setAgents((await res.json()) as AgentItem[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [apiUrl, workspaceId]);

  useEffect(() => {
    setLoading(true);
    loadAgents().catch(() => {});
  }, [loadAgents]);

  const handleDelete = useCallback(async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${apiUrl}/api/v1/agents/${agentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setAgents(prev => prev.filter(a => a.id !== agentId));
      } else {
        console.warn('[AgentList] DELETE failed:', res.status);
      }
    } catch (err) {
      console.warn('[AgentList] DELETE error:', err);
    }
  }, [apiUrl]);

  function getName(a: AgentItem): string {
    return a.displayName || a.name || 'Unnamed';
  }
  function getAvatar(a: AgentItem): string | undefined {
    return a.avatarUrl ?? a.image ?? undefined;
  }
  function getStatus(a: AgentItem): string | undefined {
    return a.status ?? a.agentStatus ?? undefined;
  }
  function getDescription(a: AgentItem): string | undefined {
    const card = (a.agentCardJson ?? {}) as { description?: string };
    return card.description;
  }

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

        {loading ? (
          <ListSkeleton count={2} />
        ) : agents.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] px-2 py-1">No agents added yet</p>
        ) : (
          <div className="space-y-0.5">
            {agents.map((agent) => {
              const name = getName(agent);
              const avatar = getAvatar(agent);
              const status = getStatus(agent);
              return (
                <AgentProfilePopup
                  key={agent.id}
                  agentId={agent.id}
                  displayName={name}
                  avatarUrl={avatar}
                  agentKey={agent.a2aId ?? agent.id}
                  agentDescription={getDescription(agent)}
                >
                  <div
                    className="group relative flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="relative shrink-0">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="w-5 h-5 rounded" />
                      ) : (
                        <Bot className="w-5 h-5 text-[var(--accent-blue)]" />
                      )}
                      <Circle
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5"
                        fill={status === 'online' ? '#4caf50' : '#9e9e9e'}
                        stroke="var(--bg-default)"
                        strokeWidth={2}
                      />
                    </div>
                    <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{name}</span>

                    {/* Delete ×  (top-right, only on hover) */}
                    <button
                      onClick={(e) => handleDelete(agent.id, e)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-destructive,#fee2e2)] text-[var(--text-tertiary)] hover:text-red-600 transition-opacity"
                      title="Remove agent"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </AgentProfilePopup>
              );
            })}
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
