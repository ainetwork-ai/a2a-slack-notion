'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import AgentCard, { AgentCardData } from './AgentCard';

export default function AgentInviteModal() {
  const { agentInviteOpen, setAgentInviteOpen } = useAppStore();
  const [url, setUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [agentCard, setAgentCard] = useState<AgentCardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!url.trim()) return;
    setIsPreviewing(true);
    setError(null);
    setAgentCard(null);
    try {
      const res = await fetch(`/api/agents/card?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) throw new Error('Failed to fetch agent card');
      const data = await res.json();
      setAgentCard(data);
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
      // Extract base URL (remove .well-known path if present)
      const a2aUrl = url.trim().replace(/\/?\.well-known\/agent(-card)?\.json$/, '').replace(/\/$/, '');
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a2aUrl }),
      });
      if (!res.ok) throw new Error('Failed to invite agent');
      setAgentInviteOpen(false);
      setUrl('');
      setAgentCard(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite agent');
    } finally {
      setIsInviting(false);
    }
  }

  function handleClose() {
    setAgentInviteOpen(false);
    setUrl('');
    setAgentCard(null);
    setError(null);
  }

  return (
    <Dialog open={agentInviteOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Invite an Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Agent A2A URL
            </label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://agent.example.com/.well-known/agent.json"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePreview()}
                className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 flex-1"
              />
              <Button
                onClick={handlePreview}
                disabled={!url.trim() || isPreviewing}
                variant="outline"
                className="border-white/10 text-white hover:bg-white/10 shrink-0"
              >
                {isPreviewing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-1" />
                    Preview
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Agent Card Preview */}
          {agentCard && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Agent Preview</p>
              <AgentCard agent={agentCard} />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={handleClose}
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!agentCard || isInviting}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isInviting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inviting...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Agent
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
