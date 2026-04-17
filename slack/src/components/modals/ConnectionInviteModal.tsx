'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import {
  connectionOrgName,
  connectionTeeParams,
  isSealedConnection,
  type AgentCardShape,
} from '@/lib/connections/is-connection';

export default function ConnectionInviteModal() {
  const { connectionInviteOpen, setConnectionInviteOpen } = useAppStore();
  const [url, setUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [card, setCard] = useState<AgentCardShape | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    const raw = url.trim();
    if (!raw) return;
    setIsPreviewing(true);
    setError(null);
    setCard(null);
    try {
      const res = await fetch(`/api/agents/card?url=${encodeURIComponent(raw)}`);
      if (!res.ok) throw new Error('Failed to fetch agent card at that URL');
      const data = (await res.json()) as AgentCardShape;
      setCard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agent card');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleEstablish() {
    if (!card) return;
    setIsInviting(true);
    setError(null);
    try {
      const a2aUrl = url
        .trim()
        .replace(/\/?\.well-known\/agent(-card)?\.json$/, '')
        .replace(/\/$/, '');
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a2aUrl, engagementLevel: 2 }),
      });
      if (!res.ok) throw new Error('Failed to establish connection');
      setConnectionInviteOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to establish connection');
    } finally {
      setIsInviting(false);
    }
  }

  function reset() {
    setUrl('');
    setCard(null);
    setError(null);
  }

  function handleClose() {
    setConnectionInviteOpen(false);
    reset();
  }

  const isSealed = card ? isSealedConnection(card) : false;
  const org = connectionOrgName(card);
  const tee = connectionTeeParams(card);
  const hardware = (tee?.tee_hardware as string[] | undefined)?.join(' + ');

  return (
    <Dialog open={connectionInviteOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="border-white/10 bg-[#1a1d21] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Link2 className="h-5 w-5" />
            Connect external data source
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[#bcabbc]">
          Establish a sealed connection to an A2A agent hosted by another organization. Their raw
          data stays inside their TEE; you query it and receive cryptographically attested answers
          here in Slack.
        </p>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-[#bcabbc]">
            Agent base URL or agent card URL
          </label>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://sealed-witness.example.com"
              className="flex-1 border-white/10 bg-white/5 text-white placeholder:text-white/30"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePreview();
              }}
            />
            <Button
              type="button"
              onClick={handlePreview}
              disabled={!url.trim() || isPreviewing}
              className="bg-white/10 text-white hover:bg-white/20"
            >
              {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Preview'}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              const origin =
                typeof window !== 'undefined' ? window.location.origin : '';
              setUrl(`${origin}/api/sealed-witness`);
            }}
            className="text-xs text-emerald-400 underline-offset-4 hover:underline"
          >
            Use built-in Sealed Witness demo (fills URL with this deployment)
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {card && (
          <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  isSealed ? 'text-emerald-400' : 'text-[#bcabbc]'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{card.name}</div>
                {org && <div className="text-xs text-[#bcabbc]">Hosted by {org}</div>}
                {card.description && (
                  <p className="mt-1 text-xs text-[#d9d2d9]">{card.description}</p>
                )}
              </div>
            </div>

            {isSealed ? (
              <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                <div className="font-medium">Sealed connection capability detected</div>
                {hardware && <div className="text-emerald-200/80">Hardware: {hardware}</div>}
                {typeof tee?.default_model === 'string' && (
                  <div className="text-emerald-200/80">Model: {tee.default_model}</div>
                )}
                <div className="mt-1 text-emerald-200/70">
                  Answers will include an attestation receipt.
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                No TEE attestation extension advertised. You can still connect, but answers will
                not carry a sealed receipt.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="text-[#bcabbc] hover:bg-white/5 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleEstablish}
            disabled={!card || isInviting}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {isInviting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Establish sealed connection'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
