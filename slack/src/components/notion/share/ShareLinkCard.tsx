'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShareLink, PermissionLevel } from './use-page-permissions';

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  full_access: 'Full access',
  can_edit: 'Can edit',
  can_comment: 'Can comment',
  can_view: 'Can view',
};

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiration';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `Expires in ${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `Expires in ${hours}h`;
  return 'Expires soon';
}

interface ShareLinkCardProps {
  link: ShareLink;
  onRevoke: (token: string) => Promise<void>;
}

export function ShareLinkCard({ link, onRevoke }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/share/${link.token}`
      : `/share/${link.token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await onRevoke(link.token);
    } finally {
      setRevoking(false);
    }
  }

  const isExpired = link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-lg border border-white/5 bg-white/[0.02]',
        isExpired && 'opacity-50'
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white font-mono truncate">{url}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-500">{LEVEL_LABELS[link.level]}</span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className={cn('text-[10px]', isExpired ? 'text-red-400' : 'text-slate-500')}>
            {formatExpiry(link.expiresAt)}
          </span>
          {link.isPublic && (
            <>
              <span className="text-[10px] text-slate-600">·</span>
              <span className="text-[10px] text-green-400">Public</span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        className="shrink-0 text-slate-400 hover:text-white hover:bg-white/10"
        title="Copy link"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleRevoke}
        disabled={revoking}
        className="shrink-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
        title="Revoke link"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
