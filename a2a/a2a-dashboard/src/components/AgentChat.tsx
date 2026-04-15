"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  AlertCircle,
  Zap,
  Radio,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { AgentCard } from "@/lib/a2a-client";

interface ChatMessage {
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  raw?: unknown;
}

export default function AgentChat({
  savedAgents,
}: {
  savedAgents: Map<string, AgentCard>;
}) {
  const [agentUrl, setAgentUrl] = useState("");
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  const [selectedSkill, setSelectedSkill] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [contextId, setContextId] = useState<string | undefined>();
  const [taskId, setTaskId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadAgent() {
    if (!agentUrl.trim()) return;
    setError("");
    try {
      const res = await fetch(
        `/api/agent-card?url=${encodeURIComponent(agentUrl.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAgentCard(data);
      setMessages([
        {
          role: "system",
          content: `Connected to ${data.name} (${data.description})`,
          timestamp: new Date(),
        },
      ]);
      setContextId(undefined);
      setTaskId(undefined);
      setSelectedSkill("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agent");
    }
  }

  function selectSavedAgent(url: string) {
    setAgentUrl(url);
    const card = savedAgents.get(url);
    if (card) {
      setAgentCard(card);
      setMessages([
        {
          role: "system",
          content: `Connected to ${card.name} (${card.description})`,
          timestamp: new Date(),
        },
      ]);
      setContextId(undefined);
      setTaskId(undefined);
      setSelectedSkill("");
    }
  }

  async function sendMessage() {
    if (!input.trim() || !agentUrl.trim() || loading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const text = input.trim();
    setInput("");
    setLoading(true);
    setError("");

    try {
      if (streaming) {
        // Streaming mode
        const streamingMsg: ChatMessage = {
          role: "agent",
          content: "",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, streamingMsg]);

        const res = await fetch("/api/agent-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentUrl: agentUrl.trim(),
            text,
            skillId: selectedSkill || undefined,
          }),
        });

        if (!res.ok || !res.body) throw new Error("Stream request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "done") break;
                if (data.type === "error") {
                  setError(data.content);
                  break;
                }
                if (data.content) {
                  fullContent = data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1]!,
                      content: fullContent,
                    };
                    return updated;
                  });
                }
              } catch {
                // skip
              }
            }
          }
        }
      } else {
        // Blocking mode
        const res = await fetch("/api/agent-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentUrl: agentUrl.trim(),
            text,
            contextId,
            taskId,
            skillId: selectedSkill || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.contextId) setContextId(data.contextId);
        if (data.taskId) setTaskId(data.taskId);

        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: data.content,
            timestamp: new Date(),
            raw: data.raw,
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Top bar: agent URL + options */}
      <div className="space-y-3 mb-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={agentUrl}
            onChange={(e) => setAgentUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAgent()}
            placeholder="Agent URL"
            className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
          />
          <button
            onClick={loadAgent}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
          >
            Connect
          </button>
        </div>

        {/* Saved agents quick select */}
        {savedAgents.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500">Recent:</span>
            {Array.from(savedAgents.entries()).map(([agentUrlKey, c]) => (
              <button
                key={agentUrlKey}
                onClick={() => selectSavedAgent(agentUrlKey)}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-full text-xs transition-colors"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Skill select + streaming toggle */}
        {agentCard && (
          <div className="flex items-center gap-3">
            {agentCard.skills && agentCard.skills.length > 0 && (
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <select
                  value={selectedSkill}
                  onChange={(e) => setSelectedSkill(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">All skills</option>
                  {agentCard.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => setStreaming(!streaming)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {streaming ? (
                <ToggleRight className="w-5 h-5 text-green-500" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
              <Radio className="w-3 h-3" />
              Stream
            </button>
            {contextId && (
              <span className="text-xs text-zinc-600">
                ctx: {contextId.slice(0, 8)}...
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-3 bg-red-950/50 border border-red-900/50 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
          >
            {msg.role !== "user" && (
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === "agent"
                    ? "bg-purple-600/20 text-purple-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : msg.role === "agent"
                    ? "bg-zinc-900 border border-zinc-800"
                    : "bg-zinc-900/50 border border-zinc-800/50 text-zinc-500 italic"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                {msg.content}
              </div>
              <div className="mt-1 text-[10px] opacity-50">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="flex gap-3 pt-3 border-t border-zinc-800">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder={
            agentCard
              ? `Message ${agentCard.name}...`
              : "Connect to an agent first"
          }
          disabled={!agentCard || loading}
          className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-blue-500 placeholder:text-zinc-600 disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={!agentCard || !input.trim() || loading}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
