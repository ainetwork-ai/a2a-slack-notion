'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Bot, Globe, Lock, EyeOff, Save, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type Visibility = 'public' | 'private' | 'unlisted';

interface RegistryAgent {
  id: string;
  displayName: string;
  avatarUrl?: string;
  status: 'online' | 'offline' | 'busy';
  a2aUrl: string;
  agentCardJson: { description?: string; skills?: { id: string; name: string }[] } | null;
  agentVisibility: Visibility;
  agentCategory: string | null;
  agentTags: string[] | null;
  createdAt: string;
  isMine: boolean;
}

const VISIBILITY_META: Record<Visibility, { label: string; icon: typeof Globe; hint: string }> = {
  public: {
    label: 'Public',
    icon: Globe,
    hint: 'Shows up in Browse for everyone.',
  },
  unlisted: {
    label: 'Unlisted',
    icon: EyeOff,
    hint: 'Not in Browse, but anyone with the URL can invite.',
  },
  private: {
    label: 'Private',
    icon: Lock,
    hint: 'Only visible to you in Mine.',
  },
};

export default function AgentsManagementPage() {
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<RegistryAgent[]>(
    '/api/agents/registry?tab=mine',
    fetcher,
    { refreshInterval: 15000 }
  );

  const agents = data ?? [];

  return (
    <div className="flex-1 overflow-auto bg-[#1a1d21] text-white">
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#bcabbc] hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">My Agents</h1>
          <p className="text-[#bcabbc] text-sm">
            Agents you first invited. Only you can edit their registry metadata.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-[#bcabbc] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && agents.length === 0 && (
          <div className="rounded-lg border border-white/10 p-8 text-center text-[#bcabbc]">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No agents yet.</p>
            <p className="text-xs mt-1">
              Invite an A2A agent from the sidebar — the first inviter becomes the owner.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {agents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} onChange={() => mutate()} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentRow({ agent, onChange }: { agent: RegistryAgent; onChange: () => void }) {
  const [visibility, setVisibility] = useState<Visibility>(agent.agentVisibility || 'private');
  const [category, setCategory] = useState(agent.agentCategory ?? '');
  const [tagsText, setTagsText] = useState((agent.agentTags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const dirty =
    visibility !== agent.agentVisibility ||
    category !== (agent.agentCategory ?? '') ||
    tagsText !== (agent.agentTags ?? []).join(', ');

  async function save() {
    setSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(`/api/agents/${agent.id}/registry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility, category: category || null, tags }),
      });
      if (res.ok) {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1500);
        onChange();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error ?? res.statusText}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${agent.displayName}" from this workspace?`)) return;
    const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
    if (res.ok) onChange();
    else alert('Failed to remove agent');
  }

  const card = agent.agentCardJson ?? {};
  const skillsCount = Array.isArray(card.skills) ? card.skills.length : 0;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="relative shrink-0">
          <Avatar className="w-10 h-10">
            {agent.avatarUrl && <AvatarImage src={agent.avatarUrl} alt={agent.displayName} />}
            <AvatarFallback className="bg-[#1d9bd1]/20 text-[#1d9bd1]">
              <Bot className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1a1d21]',
              agent.status === 'online' ? 'bg-green-400' : agent.status === 'busy' ? 'bg-yellow-400' : 'bg-slate-500'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{agent.displayName}</h3>
            <a
              href={agent.a2aUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#bcabbc] hover:text-white"
              title="Open A2A URL"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          {card.description && (
            <p className="text-xs text-[#bcabbc] mt-0.5 line-clamp-2">{card.description}</p>
          )}
          <p className="text-[11px] text-[#bcabbc]/60 mt-1 truncate">
            {agent.a2aUrl} · {skillsCount} skill{skillsCount === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={remove}
          className="p-1.5 rounded hover:bg-red-500/10 text-[#bcabbc] hover:text-red-400 transition-colors shrink-0"
          title="Remove from registry"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="col-span-3">
          <label className="text-[11px] uppercase tracking-wide text-[#bcabbc]">Visibility</label>
          <div className="flex gap-2 mt-1">
            {(Object.keys(VISIBILITY_META) as Visibility[]).map((v) => {
              const meta = VISIBILITY_META[v];
              const Icon = meta.icon;
              return (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={cn(
                    'flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs transition-colors',
                    visibility === v
                      ? 'border-[#1d9bd1] bg-[#1d9bd1]/10 text-white'
                      : 'border-white/10 text-[#bcabbc] hover:border-white/20'
                  )}
                  title={meta.hint}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[#bcabbc]/70 mt-1">{VISIBILITY_META[visibility].hint}</p>
        </div>

        <div className="col-span-1">
          <label className="text-[11px] uppercase tracking-wide text-[#bcabbc]">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="productivity"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm outline-none focus:border-[#1d9bd1]"
          />
        </div>

        <div className="col-span-2">
          <label className="text-[11px] uppercase tracking-wide text-[#bcabbc]">Tags (comma-separated)</label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="korean, translation"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm outline-none focus:border-[#1d9bd1]"
          />
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
            dirty && !saving
              ? 'bg-[#1d9bd1] text-white hover:bg-[#1d9bd1]/90'
              : 'bg-white/5 text-[#bcabbc] cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {savedTick ? 'Saved' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
