'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Bot, Wrench, Plus, Trash2, Zap } from 'lucide-react';
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

// A2A SDK capabilities (core)
interface CoreCaps {
  streaming: boolean;
  pushNotifications: boolean;
}

// A2A SDK extensions
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

export default function AgentBuildModal() {
  const { agentBuildOpen, setAgentBuildOpen } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<SkillDraft[]>([]);
  const [coreCaps, setCoreCaps] = useState<CoreCaps>({ streaming: false, pushNotifications: false });
  const [extensions, setExtensions] = useState<ExtensionToggle[]>(DEFAULT_EXTENSIONS.map(e => ({ ...e })));
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agentBuildOpen) {
      fetch('/api/mcp/servers')
        .then(r => r.json())
        .then((servers: McpServer[]) => setMcpServers(servers.filter(s => s.id !== 'slack')))
        .catch(() => {});
    }
  }, [agentBuildOpen]);

  function toggleMcp(id: string) {
    setSelectedMcp(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleExtension(key: string) {
    setExtensions(prev => prev.map(e => e.key === key ? { ...e, enabled: !e.enabled } : e));
  }

  function addSkill() { setSkills(prev => [...prev, { ...EMPTY_SKILL }]); }
  function updateSkill(i: number, field: keyof SkillDraft, value: string) {
    setSkills(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }
  function removeSkill(i: number) { setSkills(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const validSkills = skills.filter(s => s.name.trim());
      const enabledExtensions = extensions.filter(e => e.enabled).map(e => ({
        uri: e.uri,
        description: e.desc,
        required: true,
      }));

      const res = await fetch('/api/agents/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          mcpAccess: Array.from(selectedMcp),
          skills: validSkills,
          capabilities: {
            streaming: coreCaps.streaming,
            pushNotifications: coreCaps.pushNotifications,
            extensions: enabledExtensions,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create agent');
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  }

  function handleClose() {
    setAgentBuildOpen(false);
    setName(''); setDescription(''); setSystemPrompt('');
    setSelectedMcp(new Set()); setSkills([]);
    setCoreCaps({ streaming: false, pushNotifications: false });
    setExtensions(DEFAULT_EXTENSIONS.map(e => ({ ...e })));
    setError(null);
  }

  function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
      <button onClick={onClick} className={cn('shrink-0 w-8 h-5 rounded-full transition-colors relative', on ? 'bg-[#007a5a]' : 'bg-white/10')}>
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', on ? 'left-3.5' : 'left-0.5')} />
      </button>
    );
  }

  return (
    <Dialog open={agentBuildOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-xl flex items-center gap-2">
            <Wrench className="w-5 h-5" /> Build an Agent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Agent Name <span className="text-red-400">*</span></label>
            <Input placeholder="e.g. CryptoAnalyst, NewsBot" value={name} onChange={e => setName(e.target.value)} className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <Input placeholder="What does this agent do?" value={description} onChange={e => setDescription(e.target.value)} className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500" />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">System Prompt</label>
            <textarea placeholder="You are a helpful assistant that specializes in..." value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={3}
              className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#4a154b] resize-none" />
          </div>

          {/* MCP Access */}
          {mcpServers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">MCP Tool Access</label>
              <p className="text-[11px] text-slate-500 mb-2">Data sources the LLM can use. It decides when and how to call them.</p>
              <div className="space-y-1.5">
                {mcpServers.map(server => (
                  <button key={server.id} onClick={() => toggleMcp(server.id)}
                    className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors',
                      selectedMcp.has(server.id) ? 'border-[#4a154b] bg-[#4a154b]/20' : 'border-white/10 bg-[#222529] hover:border-white/20')}>
                    <span className="text-base">{server.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', selectedMcp.has(server.id) ? 'text-white' : 'text-slate-300')}>{server.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{server.description}</p>
                    </div>
                    <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
                      selectedMcp.has(server.id) ? 'border-[#4a154b] bg-[#4a154b]' : 'border-white/20')}>
                      {selectedMcp.has(server.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-300">Skills</label>
              <button onClick={addSkill} className="flex items-center gap-1 text-xs text-[#36c5f0] hover:text-white transition-colors">
                <Plus className="w-3 h-3" /> Add skill
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">High-level abilities. The agent uses MCP tools + reasoning to fulfill each skill.</p>
            {skills.length === 0 ? (
              <button onClick={addSkill} className="w-full border border-dashed border-white/10 rounded-lg py-4 text-sm text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" /> Add a skill (optional)
              </button>
            ) : (
              <div className="space-y-3">
                {skills.map((skill, i) => (
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

          {/* Capabilities (A2A SDK spec) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Capabilities</label>
            <div className="space-y-2">
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-[#222529]">
                <Toggle on={coreCaps.streaming} onClick={() => setCoreCaps(p => ({ ...p, streaming: !p.streaming }))} />
                <div className="flex-1"><p className={cn('text-sm', coreCaps.streaming ? 'text-white' : 'text-slate-400')}>Streaming</p><p className="text-[11px] text-slate-500">SSE response streaming for real-time output</p></div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-[#222529]">
                <Toggle on={coreCaps.pushNotifications} onClick={() => setCoreCaps(p => ({ ...p, pushNotifications: !p.pushNotifications }))} />
                <div className="flex-1"><p className={cn('text-sm', coreCaps.pushNotifications ? 'text-white' : 'text-slate-400')}>Async Operations</p><p className="text-[11px] text-slate-500">Push notifications for long-running tasks</p></div>
              </div>
            </div>
          </div>

          {/* Extensions (A2A SDK extensions) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Extensions</label>
            <div className="space-y-2">
              {extensions.map(ext => (
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

          {/* Auto-included */}
          <div className="bg-[#222529] border border-white/5 rounded-lg px-3 py-2">
            <p className="text-[11px] text-slate-500">
              <span className="text-slate-400 font-medium">Auto-included:</span> Slack workspace access, persistent memory, and tool-use are always enabled.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-white hover:bg-white/10">Cancel</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || isCreating} className="bg-[#4a154b] hover:bg-[#611f6a] text-white">
              {isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : <><Bot className="w-4 h-4 mr-2" />Create Agent</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
