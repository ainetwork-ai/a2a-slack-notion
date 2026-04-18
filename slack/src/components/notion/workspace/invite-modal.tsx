'use client';

import { useState } from 'react';
import { X, Link, Copy, Check, Loader2 } from 'lucide-react';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function InviteModal({ open, onClose, workspaceId }: InviteModalProps) {
  const [role, setRole] = useState<'member' | 'guest'>('member');
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same-origin — the Notion API lives at /api/v1/* in this merged Next.js app.
  const apiUrl = '';

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setInviteLink(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? 'Failed to generate invite link');
      }
      const data = (await res.json()) as { token: string };
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setInviteLink(`${origin}/invite/${data.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite link');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function handleClose() {
    onClose();
    setInviteLink(null);
    setError(null);
    setCopied(false);
    setRole('member');
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
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invite to Workspace</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Role selector */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Role</label>
            <div className="flex gap-2">
              {(['member', 'guest'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 text-sm rounded-[var(--radius-sm)] transition-colors duration-[var(--duration-micro)] capitalize ${
                    role === r
                      ? 'bg-[var(--accent-blue)] text-white font-medium'
                      : 'bg-[var(--bg-sidebar)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              {role === 'member' ? 'Members can view and edit all pages.' : 'Guests have limited, read-only access.'}
            </p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium bg-[var(--bg-sidebar)] rounded-[var(--radius-sm)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors duration-[var(--duration-micro)]"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link className="w-4 h-4" />
            )}
            Generate Invite Link
          </button>

          {/* Generated link */}
          {inviteLink && (
            <div className="p-3 bg-[var(--bg-sidebar)] rounded-[var(--radius-md)] shadow-[var(--shadow-card)]">
              <p className="text-xs text-[var(--text-tertiary)] mb-2">Share this link with people you want to invite:</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 px-2 py-1.5 text-xs bg-[var(--bg-default)] rounded-[var(--radius-input)] text-[var(--text-primary)] focus:outline-none select-all"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-default)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)] shrink-0"
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-[var(--bg-red)] rounded-[var(--radius-md)]">
              <p className="text-sm text-[var(--color-red)]">{error}</p>
            </div>
          )}

          {/* Close */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
