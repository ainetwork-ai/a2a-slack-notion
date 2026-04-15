'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Bot, Wrench } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';

interface McpServer {
  id: string;
  name: string;
  icon: string;
  description: string;
  tools: { name: string; description: string }[];
}

export default function AgentBuildModal() {
  const { agentBuildOpen, setAgentBuildOpen } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agentBuildOpen) {
      fetch('/api/mcp/servers')
        .then(r => r.json())
        .then(setMcpServers)
        .catch(() => {});
    }
  }, [agentBuildOpen]);

  function toggleMcp(id: string) {
    setSelectedMcp(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          mcpServerIds: Array.from(selectedMcp),
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

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="e.g. MarketBot, NewsHelper"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <Input
              placeholder="What does this agent do?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              System Prompt
            </label>
            <textarea
              placeholder="You are a helpful assistant that specializes in..."
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#4a154b] resize-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Define the agent's personality and behavior. Leave empty for a general-purpose assistant.
            </p>
          </div>

          {/* MCP Tools */}
          {mcpServers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                MCP Tools
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Select which MCP integrations this agent can use.
              </p>
              <div className="space-y-2">
                {mcpServers.map(server => (
                  <button
                    key={server.id}
                    onClick={() => toggleMcp(server.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                      selectedMcp.has(server.id)
                        ? 'border-[#4a154b] bg-[#4a154b]/20'
                        : 'border-white/10 bg-[#222529] hover:border-white/20'
                    )}
                  >
                    <span className="text-lg">{server.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', selectedMcp.has(server.id) ? 'text-white' : 'text-slate-300')}>
                        {server.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{server.description}</p>
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      selectedMcp.has(server.id)
                        ? 'border-[#4a154b] bg-[#4a154b]'
                        : 'border-white/20'
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
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 mr-2" />
                  Create Agent
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
