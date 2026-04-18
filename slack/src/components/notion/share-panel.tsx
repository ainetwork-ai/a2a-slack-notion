'use client';

import { useEffect, useState } from 'react';
import { Globe, Link as LinkIcon } from 'lucide-react';

interface ShareLink {
  id: string;
  token: string;
  isPublic: boolean;
  level: string;
  expiresAt: string | null;
}

interface SharePanelProps {
  open: boolean;
  onClose: () => void;
  pageId: string;
}

export function SharePanel({ open, onClose, pageId }: SharePanelProps) {
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Same-origin — the Notion API lives at /api/v1/* in this merged Next.js app.
  const apiUrl = '';

  const shareUrl = shareLink
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareLink.token}`
    : '';

  useEffect(() => {
    if (!open || !pageId) return;
    setLoading(true);
    fetch(`${apiUrl}/api/v1/pages/${pageId}/share`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((links: ShareLink[]) => {
        const publicLink = links.find((l) => l.isPublic) ?? null;
        setShareLink(publicLink);
      })
      .catch(() => setShareLink(null))
      .finally(() => setLoading(false));
  }, [open, pageId, apiUrl]);

  async function handleToggle() {
    if (loading) return;
    setLoading(true);
    try {
      if (shareLink) {
        await fetch(`${apiUrl}/api/v1/share/${shareLink.token}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        setShareLink(null);
      } else {
        const res = await fetch(`${apiUrl}/api/v1/pages/${pageId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isPublic: true, level: 'can_view' }),
        });
        if (res.ok) {
          const link = (await res.json()) as ShareLink;
          setShareLink(link);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    const url = shareLink ? shareUrl : window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  const published = !!shareLink;

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-[var(--z-dropdown)]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-[52px] right-4 z-[var(--z-dropdown)] w-[320px] bg-[var(--bg-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-panel)] border border-[var(--divider)] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Share</span>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] transition-colors duration-[var(--duration-micro)]"
          >
            ✕
          </button>
        </div>

        {/* Publish to web */}
        <div className="flex items-center justify-between py-2.5 border-b border-[var(--divider)]">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[var(--text-tertiary)] shrink-0" />
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">Publish to web</div>
              <div className="text-xs text-[var(--text-tertiary)]">
                {loading ? 'Loading...' : published ? 'Anyone with the link can view' : 'Not published'}
              </div>
            </div>
          </div>
          <button
            onClick={() => { handleToggle().catch(() => {}); }}
            role="switch"
            aria-checked={published}
            aria-label={published ? 'Unpublish' : 'Publish'}
            disabled={loading}
            className="relative w-9 h-5 rounded-full shrink-0 transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] disabled:opacity-50"
            style={{ background: published ? 'var(--accent-blue)' : 'var(--bg-hover)' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] duration-[var(--duration-micro)]"
              style={{ left: published ? '18px' : '2px' }}
            />
          </button>
        </div>

        {/* Copy link */}
        <div className="mt-3">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-[var(--radius-sm)] border border-[var(--divider)] hover:bg-[var(--bg-hover)] text-sm text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)]"
          >
            <LinkIcon size={14} className="text-[var(--text-tertiary)] shrink-0" />
            <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--text-secondary)]">
              {published ? shareUrl : (typeof window !== 'undefined' ? window.location.href : '')}
            </span>
            <span className="text-[var(--accent-blue)] font-medium shrink-0 text-xs">
              {copied ? 'Copied!' : 'Copy'}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
