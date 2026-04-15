'use client';

import { useState, useEffect } from 'react';
import { X, Play, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface McpServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  tools: McpTool[];
}

interface McpTool {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description: string; required?: boolean }>;
}

interface McpTestbedProps {
  channelId?: string;
  initialServerId?: string;
  onClose: () => void;
}

export default function McpTestbed({ channelId, initialServerId, onClose }: McpTestbedProps) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>(initialServerId || '');
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ server: string; tool: string; params: Record<string, string>; result: string; timestamp: number }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    fetch('/api/mcp/servers')
      .then(r => r.json())
      .then(setServers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialServerId && servers.length > 0) {
      setSelectedServer(initialServerId);
      const server = servers.find(s => s.id === initialServerId);
      if (server?.tools[0]) {
        setSelectedTool(server.tools[0].name);
        resetParams(server.tools[0]);
      }
    }
  }, [initialServerId, servers]);

  function resetParams(tool: McpTool) {
    const initial: Record<string, string> = {};
    if (tool.parameters) {
      for (const [key] of Object.entries(tool.parameters)) {
        initial[key] = '';
      }
    }
    setParams(initial);
  }

  function handleServerChange(serverId: string) {
    setSelectedServer(serverId);
    setSelectedTool('');
    setParams({});
    setResult(null);
    setError(null);
    const server = servers.find(s => s.id === serverId);
    if (server?.tools[0]) {
      setSelectedTool(server.tools[0].name);
      resetParams(server.tools[0]);
    }
  }

  function handleToolChange(toolName: string) {
    setSelectedTool(toolName);
    setResult(null);
    setError(null);
    const server = servers.find(s => s.id === selectedServer);
    const tool = server?.tools.find(t => t.name === toolName);
    if (tool) resetParams(tool);
  }

  async function handleExecute() {
    if (!selectedServer || !selectedTool) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // Build clean params (remove empty)
    const cleanParams: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(params)) {
      if (val.trim()) {
        cleanParams[key] = isNaN(Number(val)) ? val : Number(val);
      }
    }

    try {
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: selectedServer,
          toolName: selectedTool,
          params: cleanParams,
          channelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Execution failed');
      } else {
        setResult(data.content);
        setHistory(prev => [{
          server: selectedServer,
          tool: selectedTool,
          params: { ...params },
          result: data.content,
          timestamp: Date.now(),
        }, ...prev].slice(0, 20));
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const currentServer = servers.find(s => s.id === selectedServer);
  const currentTool = currentServer?.tools.find(t => t.name === selectedTool);
  const command = selectedServer && selectedTool
    ? `/mcp ${selectedServer} ${selectedTool}${Object.values(params).filter(Boolean).length ? ' ' + Object.values(params).filter(Boolean).join(' ') : ''}`
    : '/mcp';

  return (
    <div className="flex flex-col h-full bg-[#1a1d21] border-l border-white/5 w-96 shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">{currentServer?.icon || '🔌'}</span>
          <span className="font-semibold text-white text-sm">MCP Testbed</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3 border-b border-white/5 shrink-0">
        {/* Server select */}
        <div>
          <label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider block mb-1">Server</label>
          <select
            value={selectedServer}
            onChange={(e) => handleServerChange(e.target.value)}
            className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4a154b]"
          >
            <option value="">Select a server...</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
            ))}
          </select>
        </div>

        {/* Tool select */}
        {currentServer && (
          <div>
            <label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider block mb-1">Tool</label>
            <div className="flex gap-1.5 flex-wrap">
              {currentServer.tools.map(t => (
                <button
                  key={t.name}
                  onClick={() => handleToolChange(t.name)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    selectedTool === t.name
                      ? 'bg-[#4a154b] border-[#4a154b] text-white'
                      : 'bg-[#222529] border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {currentTool && (
              <p className="text-[11px] text-slate-500 mt-1.5">{currentTool.description}</p>
            )}
          </div>
        )}

        {/* Parameters */}
        {currentTool?.parameters && Object.keys(currentTool.parameters).length > 0 && (
          <div>
            <label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider block mb-1">Parameters</label>
            <div className="space-y-2">
              {Object.entries(currentTool.parameters).map(([key, def]) => (
                <div key={key}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs text-slate-300">{key}</span>
                    {def.required && <span className="text-[10px] text-red-400">*</span>}
                    <span className="text-[10px] text-slate-600">({def.type})</span>
                  </div>
                  <input
                    type="text"
                    value={params[key] || ''}
                    onChange={(e) => setParams(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={def.description}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleExecute(); }}
                    className="w-full bg-[#222529] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#4a154b]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Command preview + Execute */}
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] text-[#36c5f0] bg-[#222529] border border-white/10 rounded-lg px-2 py-1.5 truncate">
            {command}
          </code>
          <Button
            onClick={handleExecute}
            disabled={!selectedServer || !selectedTool || loading}
            size="sm"
            className="bg-[#007a5a] hover:bg-[#148567] text-white gap-1.5 shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run
          </Button>
        </div>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <div className="p-4">
            <label className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider block mb-2">Result</label>
            <div className="bg-[#222529] border border-white/10 rounded-lg p-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
              {result}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="px-4 pb-4">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex items-center gap-1 text-[11px] text-slate-500 uppercase font-semibold tracking-wider mb-2 hover:text-slate-300"
            >
              {historyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              History ({history.length})
            </button>
            {historyOpen && (
              <div className="space-y-2">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedServer(h.server);
                      setSelectedTool(h.tool);
                      setParams(h.params);
                      setResult(h.result);
                    }}
                    className="w-full text-left bg-[#222529] border border-white/10 rounded-lg p-2 hover:border-white/20 transition-colors"
                  >
                    <code className="text-[11px] text-[#36c5f0]">/mcp {h.server} {h.tool}</code>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(h.timestamp).toLocaleTimeString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
