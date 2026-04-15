"use client";

import { useState } from "react";
import {
  Search,
  Globe,
  Cpu,
  Zap,
  Tag,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { normalizeAgentUrl, type AgentCard } from "@/lib/a2a-client";

export default function AgentExplorer({
  onAgentLoaded,
}: {
  onAgentLoaded?: (url: string, card: AgentCard) => void;
}) {
  const [url, setUrl] = useState("");
  const [card, setCard] = useState<AgentCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [rawJson, setRawJson] = useState(false);

  async function fetchCard() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setCard(null);

    try {
      const res = await fetch(
        `/api/agent-card?url=${encodeURIComponent(url.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setCard(data);
      onAgentLoaded?.(normalizeAgentUrl(url), data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function toggleSkill(id: string) {
    setExpandedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchCard()}
            placeholder="Enter agent base URL (e.g. https://agent.example.com)"
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={fetchCard}
          disabled={loading || !url.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Globe className="w-4 h-4" />
          )}
          Fetch Card
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-900/50 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Agent Card Display */}
      {card && (
        <div className="space-y-4">
          {/* Header */}
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {card.iconUrl ? (
                  <img
                    src={card.iconUrl}
                    alt={card.name}
                    className="w-12 h-12 rounded-lg"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-lg font-bold">
                    {card.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold">{card.name}</h3>
                  <p className="text-sm text-zinc-400">{card.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
                  v{card.version}
                </span>
                {card.protocolVersion && (
                  <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
                    A2A {card.protocolVersion}
                  </span>
                )}
              </div>
            </div>

            {/* Meta info */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {card.url && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Globe className="w-3.5 h-3.5" />
                  <span className="truncate">{card.url}</span>
                </div>
              )}
              {card.provider && (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{card.provider.organization}</span>
                </div>
              )}
            </div>

            {/* Capabilities */}
            {card.capabilities &&
              Object.keys(card.capabilities).length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                    Capabilities
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(card.capabilities).map(([key, value]) => (
                      <span
                        key={key}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 rounded-full text-xs"
                      >
                        {value ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-zinc-600" />
                        )}
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* I/O Modes */}
            <div className="mt-4 flex gap-6">
              {card.defaultInputModes && (
                <div>
                  <span className="text-xs text-zinc-500">Input: </span>
                  {card.defaultInputModes.map((m) => (
                    <span
                      key={m}
                      className="ml-1 px-2 py-0.5 bg-emerald-950/50 border border-emerald-800/30 rounded text-xs text-emerald-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
              {card.defaultOutputModes && (
                <div>
                  <span className="text-xs text-zinc-500">Output: </span>
                  {card.defaultOutputModes.map((m) => (
                    <span
                      key={m}
                      className="ml-1 px-2 py-0.5 bg-sky-950/50 border border-sky-800/30 rounded text-xs text-sky-400"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Skills */}
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="flex items-center gap-2 font-medium">
                <Zap className="w-4 h-4 text-amber-500" />
                Skills
                <span className="text-xs text-zinc-500">
                  ({card.skills?.length || 0})
                </span>
              </h4>
            </div>
            {!card.skills || card.skills.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">
                No skills registered
              </p>
            ) : (
              <div className="space-y-2">
                {card.skills.map((skill, i) => {
                  const id = skill.id || `skill-${i}`;
                  const expanded = expandedSkills.has(id);
                  return (
                    <div
                      key={id}
                      className="border border-zinc-800 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleSkill(id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/50 transition-colors text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">
                            {skill.name}
                          </div>
                          <div className="text-xs text-zinc-500 truncate">
                            {skill.description}
                          </div>
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 pl-10 space-y-2">
                          <p className="text-sm text-zinc-400">
                            {skill.description}
                          </p>
                          {skill.tags && skill.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {skill.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400"
                                >
                                  <Tag className="w-3 h-3" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {skill.examples && skill.examples.length > 0 && (
                            <div>
                              <span className="text-xs text-zinc-500">
                                Examples:
                              </span>
                              <div className="mt-1 space-y-1">
                                {skill.examples.map((ex, j) => (
                                  <div
                                    key={j}
                                    className="px-3 py-1.5 bg-zinc-800/50 rounded text-xs text-zinc-300 font-mono"
                                  >
                                    {ex}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Raw JSON toggle */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setRawJson(!rawJson)}
              className="w-full flex items-center gap-2 p-3 hover:bg-zinc-900 transition-colors text-sm text-zinc-400"
            >
              {rawJson ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Raw JSON
            </button>
            {rawJson && (
              <pre className="p-4 bg-zinc-950 text-xs text-zinc-400 overflow-auto max-h-96">
                {JSON.stringify(card, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
