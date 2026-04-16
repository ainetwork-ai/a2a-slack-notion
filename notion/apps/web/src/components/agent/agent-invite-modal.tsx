'use client';

import { useState } from 'react';
import { X, Search, Loader2, Bot, Plus } from 'lucide-react';

interface AgentCardData {
  name: string;
  description?: string;
  iconUrl?: string;
  version?: string;
  skills?: Array<{ id: string; name: string; description?: string; tags?: string[] }>;
}

interface AgentInviteModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onAgentAdded?: () => void;
}

export function AgentInviteModal({ open, onClose, workspaceId, onAgentAdded }: AgentInviteModalProps) {
  const [url, setUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [agentCard, setAgentCard] = useState<AgentCardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl =
    typeof window !== 'undefined'
      ? (process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`)
      : 'http://localhost:3011';

  async function handlePreview() {
    if (!url.trim()) return;
    setIsPreviewing(true);
    setError(null);
    setAgentCard(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/agents/card?url=${encodeURIComponent(url.trim())}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch agent card');
      setAgentCard((await res.json()) as AgentCardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agent card');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleInvite() {
    if (!agentCard) return;
    setIsInviting(true);
    setError(null);
    try {
      const a2aUrl = url
        .trim()
        .replace(/\/?\.well-known\/agent(-card)?\.json$/, '')
        .replace(/\/$/, '');
      const res = await fetch(`${apiUrl}/api/v1/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ a2aUrl, workspace_id: workspaceId }),
      });
      if (!res.ok) throw new Error('Failed to invite agent');
      onAgentAdded?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite agent');
    } finally {
      setIsInviting(false);
    }
  }

  function handleClose() {
    onClose();
    setUrl('');
    setAgentCard(null);
    setError(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal-backdrop)] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={handleClose} />

      {/* Modal */}
      <div className="relative z-[var(--z-modal)] bg-[var(--bg-default)] rounded-[var(--radius-lg)] w-[480px] max-w-[calc(100vw-2rem)] p-6 shadow-[var(--shadow-modal)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Add Agent</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* URL input */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Agent A2A URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://agent.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                className="flex-1 px-3 py-2 text-sm bg-[var(--bg-sidebar)] rounded-[var(--radius-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--accent-blue)] transition-shadow duration-[var(--duration-micro)]"
              />
              <button
                onClick={handlePreview}
                disabled={!url.trim() || isPreviewing}
                className="px-3 py-2 text-sm font-medium bg-[var(--bg-sidebar)] rounded-[var(--radius-sm)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 shrink-0 transition-colors duration-[var(--duration-micro)]"
              >
                {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Agent card preview */}
          {agentCard && (
            <div className="p-4 bg-[var(--bg-sidebar)] rounded-[var(--radius-md)] shadow-[var(--shadow-card)]">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--bg-hover)] flex items-center justify-center shrink-0">
                  {agentCard.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agentCard.iconUrl} alt="" className="w-6 h-6 rounded-[var(--radius-sm)]" />
                  ) : (
                    <Bot className="w-5 h-5 text-[var(--accent-blue)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-[var(--text-primary)]">{agentCard.name}</p>
                  {agentCard.description && (
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">{agentCard.description}</p>
                  )}
                  {agentCard.skills && agentCard.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agentCard.skills.map((s) => (
                        <span
                          key={s.id}
                          className="px-2 py-0.5 text-xs rounded-[var(--radius-sm)] bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-[var(--bg-red)] rounded-[var(--radius-md)]">
              <p className="text-sm text-[var(--color-red)]">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={!agentCard || isInviting}
              className="px-4 py-2 text-sm font-medium bg-[var(--accent-blue)] text-white rounded-[var(--radius-sm)] hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-opacity duration-[var(--duration-micro)]"
            >
              {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
