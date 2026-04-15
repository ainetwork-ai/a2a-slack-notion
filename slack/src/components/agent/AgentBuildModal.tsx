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

export default function AgentBuildModal() {
  const { agentBuildOpen, setAgentBuildOpen } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<SkillDraft[]>([]);
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

  function addSkill() {
    setSkills(prev => [...prev, { ...EMPTY_SKILL }]);
  }

  function updateSkill(index: number, field: keyof SkillDraft, value: string) {
    setSkills(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function removeSkill(index: number) {
    setSkills(prev => prev.filter((_, i) => i !== index));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const validSkills = skills.filter(s => s.name.trim());
      const res = await fetch('/api/agents/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          mcpAccess: Array.from(selectedMcp),
          skills: validSkills,
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
    setName('');
    setDescription('');
    setSystemPrompt('');
    setSelectedMcp(new Set());
    setSkills([]);
    setError(null);
  }

  return (
    <Dialog open={agentBuildOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-xl flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Build an Agent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="e.g. CryptoAnalyst, NewsBot"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <Input
              placeholder="What does this agent do?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">System Prompt</label>
            <textarea
              placeholder="You are a helpful assistant that specializes in..."
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={3}
              className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#4a154b] resize-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Define personality and behavior. The agent always has access to Slack workspace tools and memory.
            </p>
          </div>

          {/* MCP Access */}
          {mcpServers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">MCP Tool Access</label>
              <p className="text-[11px] text-slate-500 mb-2">
                Which data sources can this agent use? The LLM decides when and how to call them.
              </p>
              <div className="space-y-1.5">
                {mcpServers.map(server => (
                  <button
                    key={server.id}
                    onClick={() => toggleMcp(server.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors',
                      selectedMcp.has(server.id)
                        ? 'border-[#4a154b] bg-[#4a154b]/20'
                        : 'border-white/10 bg-[#222529] hover:border-white/20'
                    )}
                  >
                    <span className="text-base">{server.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', selectedMcp.has(server.id) ? 'text-white' : 'text-slate-300')}>
                        {server.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{server.description}</p>
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0',
                      selectedMcp.has(server.id) ? 'border-[#4a154b] bg-[#4a154b]' : 'border-white/20'
                    )}>
                      {selectedMcp.has(server.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
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
              <button
                onClick={addSkill}
                className="flex items-center gap-1 text-xs text-[#36c5f0] hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" /> Add skill
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              High-level abilities. The agent uses MCP tools + reasoning to fulfill each skill.
            </p>

            {skills.length === 0 ? (
              <button
                onClick={addSkill}
                className="w-full border border-dashed border-white/10 rounded-lg py-4 text-sm text-slate-500 hover:text-slate-300 hover:border-white/20 transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Add a skill (optional)
              </button>
            ) : (
              <div className="space-y-3">
                {skills.map((skill, i) => (
                  <div key={i} className="bg-[#222529] border border-white/10 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Skill name (e.g. Market Analysis)"
                        value={skill.name}
                        onChange={e => updateSkill(i, 'name', e.target.value)}
                        className="bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-600 text-sm h-8 flex-1"
                      />
                      <button
                        onClick={() => removeSkill(i)}
                        className="text-slate-500 hover:text-red-400 shrink-0 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Input
                      placeholder="Description (e.g. Analyzes prediction markets and news)"
                      value={skill.description}
                      onChange={e => updateSkill(i, 'description', e.target.value)}
                      className="bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-600 text-sm h-8"
                    />
                    <textarea
                      placeholder="Instruction for LLM (e.g. Use polymarket and news tools to gather data, then provide a concise analysis with key takeaways)"
                      value={skill.instruction}
                      onChange={e => updateSkill(i, 'instruction', e.target.value)}
                      rows={2}
                      className="w-full bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#4a154b] resize-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Auto-included note */}
          <div className="bg-[#222529] border border-white/5 rounded-lg px-3 py-2">
            <p className="text-[11px] text-slate-500">
              <span className="text-slate-400 font-medium">Auto-included:</span> Slack workspace access (read messages, search, channel info) and persistent memory are always available.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-white hover:bg-white/10">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isCreating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
              ) : (
                <><Bot className="w-4 h-4 mr-2" />Create Agent</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
