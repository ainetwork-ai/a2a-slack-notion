'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import AgentCard, { AgentCardData } from './AgentCard';
import { cn } from '@/lib/utils';

const ENGAGEMENT_OPTIONS = [
  { level: 0, emoji: '🔇', label: 'Silent', description: 'Only responds when @mentioned' },
  { level: 1, emoji: '💬', label: 'Reactive', description: 'Responds to mentions + active threads' },
  { level: 2, emoji: '👀', label: 'Engaged', description: 'Joins relevant conversations', recommended: true },
  { level: 3, emoji: '⚡', label: 'Proactive', description: 'Actively participates' },
];

export default function AgentInviteModal() {
  const { agentInviteOpen, setAgentInviteOpen } = useAppStore();
  const [url, setUrl] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [agentCard, setAgentCard] = useState<AgentCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engagementLevel, setEngagementLevel] = useState(2);

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
        body: JSON.stringify({ a2aUrl, engagementLevel }),
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
    setEngagementLevel(2);
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

          {/* Engagement Level Picker */}
          <div className="space-y-2">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Engagement Level</p>
            <div className="space-y-1">
              {ENGAGEMENT_OPTIONS.map(opt => (
                <button
                  key={opt.level}
                  type="button"
                  onClick={() => setEngagementLevel(opt.level)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors',
                    engagementLevel === opt.level
                      ? 'bg-[#4a154b]/30 border-[#4a154b]/60 text-white'
                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  )}
                >
                  <span className="text-base shrink-0">{opt.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {opt.recommended && (
                      <span className="ml-2 text-[10px] bg-[#007a5a]/20 text-green-400 border border-green-500/20 px-1 py-0 rounded">recommended</span>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                  </div>
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                    engagementLevel === opt.level
                      ? 'border-[#4a154b] bg-[#4a154b]'
                      : 'border-white/20'
                  )} />
                </button>
              ))}
            </div>
          </div>

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
