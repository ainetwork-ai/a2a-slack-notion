"use client";

import {
  Bot,
  Globe,
  Cpu,
  Zap,
  Tag,
  Trash2,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import type { AgentCard } from "@/lib/a2a-client";

function AgentDetailCard({
  url,
  card,
  onRemove,
  onSelect,
}: {
  url: string;
  card: AgentCard;
  onRemove: (url: string) => void;
  onSelect: (url: string) => void;
}) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [rawJson, setRawJson] = useState(false);

  function copyUrl(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors">
      {/* Collapsed card - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        {/* Icon */}
        {card.iconUrl ? (
          <img
            src={card.iconUrl}
            alt={card.name}
            className="w-10 h-10 rounded-lg shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-sm font-bold shrink-0">
            {card.name.charAt(0)}
          </div>
        )}

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate">{card.name}</h4>
            <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-500 shrink-0">
              v{card.version}
            </span>
            {card.protocolVersion && (
              <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-500 shrink-0">
                A2A {card.protocolVersion}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-0.5 truncate">
            {card.description}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {card.skills && card.skills.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Zap className="w-3 h-3" />
                {card.skills.length} skill{card.skills.length > 1 ? "s" : ""}
              </span>
            )}
            {card.defaultInputModes?.map((m) => (
              <span
                key={`in-${m}`}
                className="px-1.5 py-0.5 bg-emerald-950/50 border border-emerald-800/30 rounded text-[10px] text-emerald-400"
              >
                in: {m}
              </span>
            ))}
            {card.defaultOutputModes?.map((m) => (
              <span
                key={`out-${m}`}
                className="px-1.5 py-0.5 bg-sky-950/50 border border-sky-800/30 rounded text-[10px] text-sky-400"
              >
                out: {m}
              </span>
            ))}
          </div>
        </div>

        {/* Right side actions + chevron */}
        <div className="flex items-center gap-1 shrink-0">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect(url);
            }}
            className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-blue-400 cursor-pointer"
            title="Open in Chat"
          >
            <ExternalLink className="w-4 h-4" />
          </div>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onRemove(url);
            }}
            className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-red-400 cursor-pointer"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500 ml-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 ml-1" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-800">
          {/* URL + Provider */}
          <div className="px-5 pt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-zinc-400">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{url}</span>
              <button
                onClick={copyUrl}
                className="p-0.5 hover:text-zinc-200 transition-colors shrink-0"
              >
                {copiedUrl ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
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
              <div className="px-5 pt-4">
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
          <div className="px-5 pt-4 flex gap-6">
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

          {/* Skills */}
          <div className="px-5 py-4">
            <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-lg">
              <h4 className="flex items-center gap-2 font-medium text-sm mb-3">
                <Zap className="w-4 h-4 text-amber-500" />
                Skills
                <span className="text-xs text-zinc-500">
                  ({card.skills?.length || 0})
                </span>
              </h4>
              {!card.skills || card.skills.length === 0 ? (
                <p className="text-sm text-zinc-500 italic">
                  No skills registered
                </p>
              ) : (
                <div className="space-y-2">
                  {card.skills.map((skill, i) => {
                    const sid = skill.id || `skill-${i}`;
                    const skillExpanded = expandedSkills.has(sid);
                    return (
                      <div
                        key={sid}
                        className="border border-zinc-800 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => toggleSkill(sid)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/50 transition-colors text-left"
                        >
                          {skillExpanded ? (
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
                        {skillExpanded && (
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
          </div>

          {/* Raw JSON */}
          <div className="border-t border-zinc-800">
            <button
              onClick={() => setRawJson(!rawJson)}
              className="w-full flex items-center gap-2 px-5 py-3 hover:bg-zinc-800/50 transition-colors text-sm text-zinc-500"
            >
              {rawJson ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Raw JSON
            </button>
            {rawJson && (
              <pre className="px-5 pb-4 text-xs text-zinc-400 overflow-auto max-h-64">
                {JSON.stringify(card, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentList({
  savedAgents,
  onRemove,
  onSelect,
}: {
  savedAgents: Map<string, AgentCard>;
  onRemove: (url: string) => void;
  onSelect: (url: string) => void;
}) {
  const agents = Array.from(savedAgents.entries());

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <Bot className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm">No agents loaded yet.</p>
        <p className="text-xs mt-1">
          Use Agent Explorer to fetch an agent card first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm text-zinc-400">
        {agents.length} agent{agents.length > 1 ? "s" : ""} loaded
      </h3>
      <div className="space-y-3">
        {agents.map(([url, card]) => (
          <AgentDetailCard
            key={url}
            url={url}
            card={card}
            onRemove={onRemove}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
