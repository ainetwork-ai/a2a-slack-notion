'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Bot, Wrench, Plus, Trash2, Zap, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';

interface McpServer {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface SkillDraft {
  name: string;
  description: string;
  instruction: string;
}

const EMPTY_SKILL: SkillDraft = { name: '', description: '', instruction: '' };

interface CoreCaps {
  streaming: boolean;
  pushNotifications: boolean;
}

interface ExtensionToggle {
  key: string;
  uri: string;
  label: string;
  desc: string;
  enabled: boolean;
}

const DEFAULT_EXTENSIONS: ExtensionToggle[] = [
  { key: 'auth', uri: 'urn:a2a:ext:auth:required', label: 'Requires Authentication', desc: 'Require auth token to invoke this agent', enabled: false },
  { key: 'humanApproval', uri: 'urn:a2a:ext:human-approval', label: 'Requires Human Approval', desc: 'Ask for human confirmation on important actions', enabled: false },
  { key: 'x402', uri: 'urn:a2a:ext:x402-payment', label: 'x402 Micropayment', desc: 'Accept x402 micropayments for premium skill usage', enabled: false },
];

interface AgentDraft {
  name: string;
  description: string;
  systemPrompt: string;
  selectedMcp: Set<string>;
  skills: SkillDraft[];
  coreCaps: CoreCaps;
  extensions: ExtensionToggle[];
}

type BuildStatus = 'idle' | 'building' | 'done' | 'error';

interface AgentBuildResult {
  status: BuildStatus;
  error?: string;
}

function newDraft(): AgentDraft {
  return {
    name: '',
    description: '',
    systemPrompt: '',
    selectedMcp: new Set(),
    skills: [],
    coreCaps: { streaming: false, pushNotifications: false },
    extensions: DEFAULT_EXTENSIONS.map(e => ({ ...e })),
  };
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('shrink-0 w-8 h-5 rounded-full transition-colors relative', on ? 'bg-[#007a5a]' : 'bg-white/10')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', on ? 'left-3.5' : 'left-0.5')} />
    </button>
  );
}

interface AgentFormProps {
  draft: AgentDraft;
  mcpServers: McpServer[];
  onChange: (updated: AgentDraft) => void;
}

function AgentForm({ draft, mcpServers, onChange }: AgentFormProps) {
  function toggleMcp(id: string) {
    const next = new Set(draft.selectedMcp);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ ...draft, selectedMcp: next });
  }

  function toggleExtension(key: string) {
    onChange({ ...draft, extensions: draft.extensions.map(e => e.key === key ? { ...e, enabled: !e.enabled } : e) });
  }

  function addSkill() { onChange({ ...draft, skills: [...draft.skills, { ...EMPTY_SKILL }] }); }
  function updateSkill(i: number, field: keyof SkillDraft, value: string) {
    onChange({ ...draft, skills: draft.skills.map((s, idx) => idx === i ? { ...s, [field]: value } : s) });
  }
  function removeSkill(i: number) { onChange({ ...draft, skills: draft.skills.filter((_, idx) => idx !== i) }); }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Agent Name <span className="text-red-400">*</span></label>
        <Input placeholder="e.g. CryptoAnalyst, NewsBot" value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
        <Input placeholder="What does this agent do?" value={draft.description} onChange={e => onChange({ ...draft, description: e.target.value })} className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">System Prompt</label>
        <textarea placeholder="You are a helpful assistant that specializes in..." value={draft.systemPrompt} onChange={e => onChange({ ...draft, systemPrompt: e.target.value })} rows={3}
          className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#4a154b] resize-none" />
      </div>

      {mcpServers.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">MCP Tool Access</label>
          <p className="text-[11px] text-slate-500 mb-2">Data sources the LLM can use. It decides when and how to call them.</p>
          <div className="space-y-1.5">
            {mcpServers.map(server => (
              <button key={server.id} onClick={() => toggleMcp(server.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors',
                  draft.selectedMcp.has(server.id) ? 'border-[#4a154b] bg-[#4a154b]/20' : 'border-white/10 bg-[#222529] hover:border-white/20')}>
                <span className="text-base">{server.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', draft.selectedMcp.has(server.id) ? 'text-white' : 'text-slate-300')}>{server.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{server.description}</p>
                </div>
                <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
                  draft.selectedMcp.has(server.id) ? 'border-[#4a154b] bg-[#4a154b]' : 'border-white/20')}>
                  {draft.selectedMcp.has(server.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-300">Skills</label>
          <button onClick={addSkill} className="flex items-center gap-1 text-xs text-[#36c5f0] hover:text-white transition-colors">
            <Plus className="w-3 h-3" /> Add skill
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">High-level abilities. The agent uses MCP tools + reasoning to fulfill each skill.</p>
        {draft.skills.length === 0 ? (
          <button onClick={addSkill} className="w-full border border-dashed border-white/10 rounded-lg py-4 text-sm text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" /> Add a skill (optional)
          </button>
        ) : (
          <div className="space-y-3">
            {draft.skills.map((skill, i) => (
              <div key={i} className="bg-[#222529] border border-white/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Skill name" value={skill.name} onChange={e => updateSkill(i, 'name', e.target.value)} className="bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-600 text-sm h-8 flex-1" />
                  <button onClick={() => removeSkill(i)} className="text-slate-500 hover:text-red-400 shrink-0 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <Input placeholder="Description" value={skill.description} onChange={e => updateSkill(i, 'description', e.target.value)} className="bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-600 text-sm h-8" />
                <textarea placeholder="LLM instruction (how to fulfill this skill)" value={skill.instruction} onChange={e => updateSkill(i, 'instruction', e.target.value)} rows={2}
                  className="w-full bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#4a154b] resize-none" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Capabilities</label>
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-[#222529]">
            <Toggle on={draft.coreCaps.streaming} onClick={() => onChange({ ...draft, coreCaps: { ...draft.coreCaps, streaming: !draft.coreCaps.streaming } })} />
            <div className="flex-1"><p className={cn('text-sm', draft.coreCaps.streaming ? 'text-white' : 'text-slate-400')}>Streaming</p><p className="text-[11px] text-slate-500">SSE response streaming for real-time output</p></div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-[#222529]">
            <Toggle on={draft.coreCaps.pushNotifications} onClick={() => onChange({ ...draft, coreCaps: { ...draft.coreCaps, pushNotifications: !draft.coreCaps.pushNotifications } })} />
            <div className="flex-1"><p className={cn('text-sm', draft.coreCaps.pushNotifications ? 'text-white' : 'text-slate-400')}>Async Operations</p><p className="text-[11px] text-slate-500">Push notifications for long-running tasks</p></div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Extensions</label>
        <div className="space-y-2">
          {draft.extensions.map(ext => (
            <div key={ext.key} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-[#222529]">
              <Toggle on={ext.enabled} onClick={() => toggleExtension(ext.key)} />
              <div className="flex-1">
                <p className={cn('text-sm', ext.enabled ? 'text-white' : 'text-slate-400')}>{ext.label}</p>
                <p className="text-[11px] text-slate-500">{ext.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#222529] border border-white/5 rounded-lg px-3 py-2">
        <p className="text-[11px] text-slate-500">
          <span className="text-slate-400 font-medium">Auto-included:</span> Slack workspace access, persistent memory, and tool-use are always enabled.
        </p>
      </div>
    </div>
  );
}

export default function AgentBuildModal() {
  const { agentBuildOpen, setAgentBuildOpen } = useAppStore();
  const [drafts, setDrafts] = useState<AgentDraft[]>([newDraft()]);
  const [activeTab, setActiveTab] = useState(0);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildResults, setBuildResults] = useState<AgentBuildResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (agentBuildOpen) {
      fetch('/api/mcp/servers')
        .then(r => r.json())
        .then((servers: McpServer[]) => setMcpServers(servers.filter(s => s.id !== 'slack')))
        .catch(() => {});
    }
  }, [agentBuildOpen]);

  function addAgent() {
    setDrafts(prev => [...prev, newDraft()]);
    setActiveTab(drafts.length);
  }

  function removeAgent(i: number) {
    if (drafts.length === 1) return;
    const next = drafts.filter((_, idx) => idx !== i);
    setDrafts(next);
    setActiveTab(Math.min(activeTab, next.length - 1));
  }

  function updateDraft(i: number, updated: AgentDraft) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? updated : d));
  }

  async function handleBuildAll() {
    setIsBuilding(true);
    setGlobalError(null);
    const results: AgentBuildResult[] = drafts.map(() => ({ status: 'building' as BuildStatus }));
    setBuildResults([...results]);

    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i];
      try {
        const validSkills = draft.skills.filter(s => s.name.trim());
        const enabledExtensions = draft.extensions.filter(e => e.enabled).map(e => ({
          uri: e.uri,
          description: e.desc,
          required: true,
        }));

        const res = await fetch('/api/agents/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim(),
            systemPrompt: draft.systemPrompt.trim(),
            mcpAccess: Array.from(draft.selectedMcp),
            skills: validSkills,
            capabilities: {
              streaming: draft.coreCaps.streaming,
              pushNotifications: draft.coreCaps.pushNotifications,
              extensions: enabledExtensions,
            },
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          results[i] = { status: 'error', error: data.error || 'Failed to create agent' };
        } else {
          results[i] = { status: 'done' };
        }
      } catch (err) {
        results[i] = { status: 'error', error: err instanceof Error ? err.message : 'Failed to create agent' };
      }
      setBuildResults([...results]);
    }

    setIsBuilding(false);

    const allDone = results.every(r => r.status === 'done');
    if (allDone) {
      setTimeout(handleClose, 800);
    }
  }

  function handleClose() {
    setAgentBuildOpen(false);
    setDrafts([newDraft()]);
    setActiveTab(0);
    setBuildResults([]);
    setGlobalError(null);
  }

  const isBatchMode = drafts.length > 1;
  const allNamed = drafts.every(d => d.name.trim());
  const buildDone = buildResults.length > 0 && buildResults.every(r => r.status === 'done' || r.status === 'error');

  return (
    <Dialog open={agentBuildOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-xl flex items-center gap-2">
            <Wrench className="w-5 h-5" /> Build {isBatchMode ? 'Agents' : 'an Agent'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {/* Tabs for multiple agents */}
          {isBatchMode && (
            <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
              {drafts.map((draft, i) => {
                const result = buildResults[i];
                return (
                  <button key={i} onClick={() => setActiveTab(i)}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0',
                      activeTab === i ? 'bg-[#4a154b] text-white' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10')}>
                    {result?.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                    {result?.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    {result?.status === 'building' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {draft.name.trim() || `Agent ${i + 1}`}
                    {!isBuilding && drafts.length > 1 && (
                      <span onClick={e => { e.stopPropagation(); removeAgent(i); }}
                        className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors">
                        &times;
                      </span>
                    )}
                  </button>
                );
              })}
              {!isBuilding && (
                <button onClick={addAgent} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-[#36c5f0] hover:text-white hover:bg-white/10 transition-colors shrink-0">
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
          )}

          {/* Build progress summary */}
          {buildResults.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {drafts.map((draft, i) => {
                const result = buildResults[i];
                return (
                  <div key={i} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                    result?.status === 'done' ? 'bg-green-500/10 border border-green-500/20' :
                    result?.status === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                    'bg-white/5 border border-white/10')}>
                    {result?.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                    {result?.status === 'error' && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    {result?.status === 'building' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    <span className={cn('font-medium', result?.status === 'done' ? 'text-green-300' : result?.status === 'error' ? 'text-red-300' : 'text-slate-300')}>
                      {draft.name.trim() || `Agent ${i + 1}`}
                    </span>
                    {result?.status === 'error' && result.error && (
                      <span className="text-red-400 text-xs ml-auto">{result.error}</span>
                    )}
                    {result?.status === 'done' && (
                      <span className="text-green-400 text-xs ml-auto">Created</span>
                    )}
                    {result?.status === 'building' && (
                      <span className="text-slate-400 text-xs ml-auto">Building...</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Form for active tab */}
          {!buildDone && (
            <AgentForm
              draft={drafts[activeTab]}
              mcpServers={mcpServers}
              onChange={(updated) => updateDraft(activeTab, updated)}
            />
          )}

          {globalError && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{globalError}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-5 mt-2">
            {!isBuilding && !buildDone && (
              <button onClick={addAgent} className="flex items-center gap-1.5 text-xs text-[#36c5f0] hover:text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add another agent
              </button>
            )}
            {(isBuilding || buildDone) && <div />}
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-white hover:bg-white/10">
                {buildDone ? 'Close' : 'Cancel'}
              </Button>
              {!buildDone && (
                <Button onClick={handleBuildAll} disabled={!allNamed || isBuilding}
                  className="bg-[#4a154b] hover:bg-[#611f6a] text-white">
                  {isBuilding
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Building...</>
                    : isBatchMode
                      ? <><Bot className="w-4 h-4 mr-2" />Build all ({drafts.length})</>
                      : <><Bot className="w-4 h-4 mr-2" />Create Agent</>
                  }
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
