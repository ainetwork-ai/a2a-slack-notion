"use client";

import { useState, useCallback, useEffect } from "react";
import { Search, MessageSquare, Play, Boxes, Users, FlaskConical } from "lucide-react";
import AgentExplorer from "@/components/AgentExplorer";
import AgentList from "@/components/AgentList";
import AgentChat from "@/components/AgentChat";
import ScriptRunner from "@/components/ScriptRunner";
import AgentTester from "@/components/AgentTester";
import type { AgentCard } from "@/lib/a2a-client";

type Tab = "tester" | "explorer" | "agents" | "chat" | "scripts";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "tester", label: "Agent Tester", icon: <FlaskConical className="w-4 h-4" /> },
  { id: "explorer", label: "Agent Explorer", icon: <Search className="w-4 h-4" /> },
  { id: "agents", label: "Agents", icon: <Users className="w-4 h-4" /> },
  { id: "chat", label: "Agent Chat", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "scripts", label: "Script Runner", icon: <Play className="w-4 h-4" /> },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("tester");
  const [savedAgents, setSavedAgents] = useState<Map<string, AgentCard>>(
    () => new Map()
  );

  // Load saved agents from DB on mount
  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data: { url: string; card: AgentCard }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setSavedAgents(new Map(data.map((a) => [a.url, a.card])));
        }
      })
      .catch(() => {});
  }, []);

  // Save to DB when agent is fetched
  const handleAgentLoaded = useCallback((url: string, card: AgentCard) => {
    setSavedAgents((prev) => {
      const next = new Map(prev);
      next.set(url, card);
      return next;
    });

    fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, card }),
    }).catch(() => {});
  }, []);

  // Remove from DB
  const handleRemoveAgent = useCallback((url: string) => {
    setSavedAgents((prev) => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });

    fetch("/api/agents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Boxes className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold">A2A Test Console</h1>
              <p className="text-xs text-zinc-500">
                Agent-to-Agent Protocol Testing
              </p>
            </div>
          </div>
          {savedAgents.size > 0 && (
            <div className="text-xs text-zinc-500">
              {savedAgents.size} agent{savedAgents.size > 1 ? "s" : ""} loaded
            </div>
          )}
        </div>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === "tester" && <AgentTester />}
        {activeTab === "explorer" && (
          <AgentExplorer onAgentLoaded={handleAgentLoaded} />
        )}
        {activeTab === "agents" && (
          <AgentList
            savedAgents={savedAgents}
            onRemove={handleRemoveAgent}
            onSelect={() => {
              setActiveTab("chat");
            }}
          />
        )}
        {activeTab === "chat" && <AgentChat savedAgents={savedAgents} />}
        {activeTab === "scripts" && <ScriptRunner />}
      </main>
    </div>
  );
}
