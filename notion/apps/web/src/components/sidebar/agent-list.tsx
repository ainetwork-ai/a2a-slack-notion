'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, Plus, Circle, X, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { AgentInviteModal } from '@/components/agent/agent-invite-modal';
import { ListSkeleton } from './list-skeleton';

interface AgentItem {
  id: string;
  name: string;
  image: string | null;
  agentStatus: string | null;
}

interface AgentSkill {
  id: string;
  name: string;
  description?: string;
}

interface AgentListProps {
  workspaceId: string;
}

export function AgentList({ workspaceId }: AgentListProps) {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentSkills, setAgentSkills] = useState<Record<string, AgentSkill[]>>({});
  const [statusLoading, setStatusLoading] = useState<Record<string, boolean>>({});

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
        setSelectedAgentId(prev => prev === agentId ? null : prev);
      } else {
        console.warn('[AgentList] DELETE failed:', res.status);
      }
    } catch (err) {
      console.warn('[AgentList] DELETE error:', err);
    }
  }, [apiUrl]);

  const handleTogglePanel = useCallback((agentId: string) => {
    const isOpening = selectedAgentId !== agentId;
    setSelectedAgentId(isOpening ? agentId : null);
    if (isOpening && !agentSkills[agentId]) {
      fetch(`${apiUrl}/api/v1/agents/${agentId}/skills`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then((skills: AgentSkill[]) => setAgentSkills(prev => ({ ...prev, [agentId]: skills })))
        .catch(() => {});
    }
  }, [apiUrl, agentSkills, selectedAgentId]);

  const handleRefreshStatus = useCallback(async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStatusLoading(prev => ({ ...prev, [agentId]: true }));
    try {
      const res = await fetch(`${apiUrl}/api/v1/agents/${agentId}/health`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json() as { status: string };
        setAgents(prev => prev.map(a =>
          a.id === agentId ? { ...a, agentStatus: data.status === 'online' ? 'online' : 'offline' } : a,
        ));
      }
    } catch {
      /* ignore */
    } finally {
      setStatusLoading(prev => ({ ...prev, [agentId]: false }));
    }
  }, [apiUrl]);

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
            {agents.map((agent) => (
              <div key={agent.id}>
                {/* Agent row */}
                <div
                  className="group relative flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  onClick={() => handleTogglePanel(agent.id)}
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
                  <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{agent.name}</span>

                  {/* Chevron */}
                  <span className="shrink-0 text-[var(--text-tertiary)]">
                    {selectedAgentId === agent.id
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </span>

                  {/* Delete ×  (top-right, only on hover) */}
                  <button
                    onClick={(e) => handleDelete(agent.id, e)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-destructive,#fee2e2)] text-[var(--text-tertiary)] hover:text-red-600 transition-opacity"
                    title="Remove agent"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Detail panel */}
                {selectedAgentId === agent.id && (
                  <div className="mx-2 mb-1 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-xs space-y-2" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08)', maxHeight: 120, overflowY: 'auto' }}>
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Circle
                          className="w-2.5 h-2.5 shrink-0"
                          fill={agent.agentStatus === 'online' ? '#4caf50' : '#9e9e9e'}
                          stroke="none"
                        />
                        <span className="text-[var(--text-secondary)] capitalize">{agent.agentStatus ?? 'unknown'}</span>
                      </div>
                      <button
                        onClick={(e) => handleRefreshStatus(agent.id, e)}
                        disabled={statusLoading[agent.id]}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        title="Refresh status"
                      >
                        <RefreshCw className={`w-3 h-3 ${statusLoading[agent.id] ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {/* Skills */}
                    {agentSkills[agent.id] !== undefined && (
                      <div>
                        <p className="text-[var(--text-tertiary)] font-medium mb-1">Skills</p>
                        {agentSkills[agent.id]!.length === 0 ? (
                          <p className="text-[var(--text-tertiary)]">No skills listed</p>
                        ) : (
                          <ul className="space-y-1">
                            {agentSkills[agent.id]!.map(skill => (
                              <li key={skill.id} className="text-[var(--text-secondary)]">
                                <span className="font-medium text-[var(--text-primary)]">{skill.name}</span>
                                {skill.description && (
                                  <span className="ml-1 text-[var(--text-tertiary)]">— {skill.description}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      onClick={(e) => handleDelete(agent.id, e)}
                      className="w-full text-left px-2 py-1 rounded hover:bg-[var(--bg-hover)] text-red-500 hover:text-red-600"
                    >
                      Remove agent
                    </button>
                  </div>
                )}
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
