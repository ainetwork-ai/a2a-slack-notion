"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  RefreshCw,
  Clock,
  FileJson,
  FileText,
  MessageSquare,
  Search,
} from "lucide-react";

// ───────────────────────────── constants ─────────────────────────────

const DEFAULT_BASE_URL = "https://a2a-slack-notion.vercel.app";

interface AgentDef {
  id: string;
  name: string;
  nameKor: string;
  role: "editor" | "reporter" | "manager" | "designer";
  specialty: string;
}

const AGENTS: AgentDef[] = [
  { id: "unblock-damien", name: "Damien", nameKor: "다미엔", role: "editor", specialty: "편집국장 — 기자 배정 / 최종 승인" },
  { id: "unblock-max", name: "Max", nameKor: "맥스", role: "reporter", specialty: "Bitcoin" },
  { id: "unblock-techa", name: "Techa", nameKor: "테카", role: "reporter", specialty: "Blockchain / AI" },
  { id: "unblock-mark", name: "Mark", nameKor: "마크", role: "reporter", specialty: "Altcoin / Memecoin" },
  { id: "unblock-roy", name: "Roy", nameKor: "로이", role: "reporter", specialty: "Regulation / Legal" },
  { id: "unblock-april", name: "April", nameKor: "에이프릴", role: "reporter", specialty: "Projects / Interviews" },
  { id: "unblock-victoria", name: "Victoria", nameKor: "빅토리아", role: "manager", specialty: "Finance" },
  { id: "unblock-logan", name: "Logan", nameKor: "로건", role: "manager", specialty: "Tech / Projects" },
  { id: "unblock-lilly", name: "Lilly", nameKor: "릴리", role: "manager", specialty: "Law / Regulation" },
  { id: "unblock-olive", name: "Olive", nameKor: "올리브", role: "designer", specialty: "디자이너 — 커버 이미지" },
];

const ROLE_LABELS: Record<AgentDef["role"], string> = {
  editor: "편집국장",
  reporter: "기자",
  manager: "팀장",
  designer: "디자이너",
};

const ROLE_COLORS: Record<AgentDef["role"], string> = {
  editor: "text-amber-400",
  reporter: "text-blue-400",
  manager: "text-emerald-400",
  designer: "text-purple-400",
};

interface SkillVarSchema {
  key: string;
  label: string;
  autoToday?: boolean; // pre-fill with today's date
}

const SKILL_VARIABLES: Record<string, SkillVarSchema[]> = {
  assignment: [
    { key: "TODAY_DATE", label: "TODAY_DATE", autoToday: true },
    { key: "BASIC_ARTICLE_SOURCE", label: "BASIC_ARTICLE_SOURCE (원문)" },
  ],
  report: [
    { key: "TODAY_DATE", label: "TODAY_DATE", autoToday: true },
    { key: "BASIC_ARTICLE_SOURCE", label: "BASIC_ARTICLE_SOURCE (원문)" },
    { key: "CHIEF_COMMENT", label: "CHIEF_COMMENT (편집장 지시)" },
  ],
  guide: [
    { key: "REPORTER", label: "REPORTER (기자 이름)" },
    { key: "MARKET_RESEARCH", label: "MARKET_RESEARCH (리서치)" },
  ],
  writing: [
    { key: "MARKET_RESEARCH", label: "MARKET_RESEARCH (리서치)" },
    { key: "ARTICLE_GUIDE", label: "ARTICLE_GUIDE (기사 가이드)" },
  ],
  feedback: [
    { key: "REPORTER", label: "REPORTER (기자 이름)" },
    { key: "TODAY_DATE", label: "TODAY_DATE", autoToday: true },
    { key: "BASIC_ARTICLE_SOURCE", label: "BASIC_ARTICLE_SOURCE (원문)" },
    { key: "ARTICLE_DRAFT", label: "ARTICLE_DRAFT (기사 초안)" },
  ],
  revision: [
    { key: "ARTICLE_DRAFT", label: "ARTICLE_DRAFT (기사 초안)" },
    { key: "MANAGER_FEEDBACK", label: "MANAGER_FEEDBACK (팀장 피드백)" },
  ],
  confirm: [
    { key: "REPORTER", label: "REPORTER (기자 이름)" },
    { key: "TODAY_DATE", label: "TODAY_DATE", autoToday: true },
    { key: "CORRECTED_ARTICLE", label: "CORRECTED_ARTICLE (수정 기사)" },
  ],
  drawing: [],
};

function todayKST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ───────────────────────────── types ─────────────────────────────

interface AgentCardData {
  name: string;
  description: string;
  version: string;
  protocolVersion?: string;
  url?: string;
  skills?: { id: string; name: string; description: string }[];
}

interface TestResult {
  id: string;
  agentId: string;
  skillId: string | null;
  prompt: string;
  variables: Record<string, string>;
  requestBody: unknown;
  systemPrompt?: string;
  responseText?: string;
  error?: string;
  durationMs?: number;
  timestamp: Date;
}

// ───────────────────────────── component ─────────────────────────────

export default function AgentTester() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, boolean | null>>({});
  const [cardMap, setCardMap] = useState<Record<string, AgentCardData>>({});

  // Selected agent state
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [userMessage, setUserMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Record<string, boolean>>>({});

  // News search for auto-fill
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [newsItems, setNewsItems] = useState<{ title: string; url: string; snippet: string }[]>([]);

  const resultsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resultsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [results]);

  // Fetch all agent cards on mount or when base URL changes
  const fetchAllCards = useCallback(async () => {
    const newHealth: Record<string, boolean | null> = {};
    const newCards: Record<string, AgentCardData> = {};
    AGENTS.forEach((a) => (newHealth[a.id] = null));
    setHealthMap({ ...newHealth });

    await Promise.allSettled(
      AGENTS.map(async (agent) => {
        try {
          const cardUrl = `${baseUrl.replace(/\/$/, "")}/api/agents/${agent.id}/.well-known/agent.json`;
          const res = await fetch(`/api/agent-card?url=${encodeURIComponent(cardUrl)}`);
          if (!res.ok) throw new Error();
          const card = await res.json();
          newHealth[agent.id] = true;
          newCards[agent.id] = card;
        } catch {
          newHealth[agent.id] = false;
        }
      })
    );
    setHealthMap({ ...newHealth });
    setCardMap(newCards);
  }, [baseUrl]);

  useEffect(() => {
    fetchAllCards();
  }, [fetchAllCards]);

  // When selected agent changes, reset skill/variables
  useEffect(() => {
    setSelectedSkill("");
    setVariableValues({});
    setUserMessage("");
    setNewsItems([]);
    setSearchQuery("");
  }, [selectedId]);

  // When skill changes, pre-fill autoToday variables
  useEffect(() => {
    const schema = SKILL_VARIABLES[selectedSkill];
    if (!schema) {
      setVariableValues({});
      return;
    }
    const prefill: Record<string, string> = {};
    for (const v of schema) {
      if (v.autoToday) prefill[v.key] = todayKST();
      else prefill[v.key] = variableValues[v.key] ?? "";
    }
    setVariableValues(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkill]);

  async function searchNews() {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    setNewsItems([]);
    try {
      const res = await fetch("/api/agent-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, source: searchQuery.trim(), mode: "single" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewsItems(data.items ?? []);
    } catch {
      setNewsItems([]);
    } finally {
      setSearching(false);
    }
  }

  function selectNewsItem(item: { title: string; url: string; snippet: string }) {
    const formatted = `[${item.title}](${item.url})\n${item.snippet}`;
    setVariableValues((prev) => ({
      ...prev,
      BASIC_ARTICLE_SOURCE: formatted,
      // report 스킬: 편집장 지시 + 메시지도 자동 채우기
      ...(selectedSkill === "report" && {
        CHIEF_COMMENT: `위 기사를 바탕으로 시장 조사 및 리서치를 진행해주세요. 핵심 사건과 시장 영향을 분석해줘.`,
      }),
    }));
    if (selectedSkill === "report") {
      setUserMessage("편집장 지시에 따라 시장 조사/리서치 보고를 작성해줘.");
    }
  }

  const selectedAgent = AGENTS.find((a) => a.id === selectedId) ?? null;
  const selectedCard = selectedId ? cardMap[selectedId] : null;
  const skills = selectedCard?.skills ?? [];

  async function sendTest() {
    if (!selectedId || !userMessage.trim() || sending) return;
    setSending(true);

    const agentUrl = `${baseUrl.replace(/\/$/, "")}/api/agents/${selectedId}`;
    const vars = selectedSkill ? { ...variableValues } : {};
    // Remove empty vars
    for (const k of Object.keys(vars)) {
      if (!vars[k]) delete vars[k];
    }

    const resultId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const placeholder: TestResult = {
      id: resultId,
      agentId: selectedId,
      skillId: selectedSkill || null,
      prompt: userMessage.trim(),
      variables: vars,
      requestBody: null,
      timestamp: new Date(),
    };
    setResults((prev) => [...prev, placeholder]);

    const t0 = Date.now();
    try {
      const res = await fetch("/api/agent-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentUrl,
          text: userMessage.trim(),
          skillId: selectedSkill || undefined,
          variables: Object.keys(vars).length > 0 ? vars : undefined,
          debug: true,
        }),
      });
      const data = await res.json();
      const durationMs = Date.now() - t0;

      if (!res.ok || data.error) {
        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? { ...r, error: data.error || `HTTP ${res.status}`, durationMs, requestBody: data.requestBody ?? null }
              : r
          )
        );
      } else {
        setResults((prev) =>
          prev.map((r) =>
            r.id === resultId
              ? {
                  ...r,
                  responseText: data.content,
                  systemPrompt: data.systemPrompt,
                  requestBody: data.requestBody,
                  durationMs,
                }
              : r
          )
        );
      }
    } catch (e) {
      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, error: e instanceof Error ? e.message : "Network error", durationMs: Date.now() - t0 }
            : r
        )
      );
    } finally {
      setSending(false);
    }
  }

  function toggleSection(resultId: string, section: string) {
    setExpanded((prev) => ({
      ...prev,
      [resultId]: { ...prev[resultId], [section]: !prev[resultId]?.[section] },
    }));
  }

  return (
    <div className="flex h-[calc(100vh-12rem)]">
      {/* ────────── Left sidebar ────────── */}
      <div className="w-64 border-r border-zinc-800 pr-3 flex flex-col overflow-hidden">
        {/* Base URL */}
        <label className="text-[10px] text-zinc-500 mb-1">Base URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="px-2 py-1 mb-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-600"
        />
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-400 font-medium">Agents</span>
          <button
            onClick={fetchAllCards}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {(["editor", "reporter", "manager", "designer"] as const).map((role) => {
            const group = AGENTS.filter((a) => a.role === role);
            return (
              <div key={role}>
                <div className={`text-[10px] font-medium uppercase tracking-wider mb-1 ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </div>
                <div className="space-y-0.5">
                  {group.map((agent) => {
                    const health = healthMap[agent.id];
                    const active = selectedId === agent.id;
                    return (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedId(agent.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                          active
                            ? "bg-zinc-800 border border-zinc-700"
                            : "hover:bg-zinc-900 border border-transparent"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            health === true
                              ? "bg-green-500"
                              : health === false
                                ? "bg-red-500"
                                : "bg-zinc-600 animate-pulse"
                          }`}
                        />
                        <span className="font-medium truncate">
                          {agent.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate ml-auto">
                          {agent.nameKor}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ────────── Main panel: form + results side by side ────────── */}
      {!selectedAgent ? (
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <div className="text-center">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">좌측에서 에이전트를 선택하세요</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-w-0">
          {/* ── Form column ── */}
          <div className="w-[380px] shrink-0 border-r border-zinc-800 px-4 flex flex-col overflow-hidden">
            {/* Agent header (compact) */}
            <div className="flex items-center gap-2.5 py-3 border-b border-zinc-800 mb-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                {selectedAgent.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm">{selectedAgent.name}</span>
                  <span className="text-[10px] text-zinc-500">{selectedAgent.nameKor}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded ${ROLE_COLORS[selectedAgent.role]} bg-zinc-800`}>
                    {ROLE_LABELS[selectedAgent.role]}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${
                      healthMap[selectedAgent.id] === true ? "bg-green-500" : healthMap[selectedAgent.id] === false ? "bg-red-500" : "bg-zinc-600"
                    }`}
                  />
                </div>
                <div className="text-[10px] text-zinc-500 truncate">{selectedAgent.specialty}</div>
              </div>
            </div>

            {/* Skill selector */}
            <div className="flex items-center gap-1.5 mb-3 shrink-0 flex-wrap">
              <button
                onClick={() => setSelectedSkill("")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  !selectedSkill
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <MessageSquare className="w-3 h-3 inline mr-1" />
                Free Chat
              </button>
              {skills.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSkill(s.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    selectedSkill === s.id
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <Zap className="w-3 h-3 inline mr-1" />
                  {s.id}
                </button>
              ))}
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-3">
              {/* News search (report skill) */}
              {selectedSkill === "report" && (
                <div className="border border-amber-900/40 rounded-lg p-2.5 bg-amber-950/20 space-y-2">
                  <div className="text-[10px] font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-3 h-3" />
                    News Search
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchNews()}
                      placeholder="bitcoin ETF, 이더리움..."
                      className="flex-1 px-2 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-amber-600 placeholder:text-zinc-600"
                    />
                    <button
                      onClick={searchNews}
                      disabled={searching || !searchQuery.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg text-xs font-medium transition-colors shrink-0"
                    >
                      {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {newsItems.length > 0 && (
                    <div className="space-y-1">
                      {newsItems.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => selectNewsItem(item)}
                          className="w-full text-left p-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-700 transition-colors"
                        >
                          <div className="text-[11px] font-medium text-zinc-200 line-clamp-1">{item.title}</div>
                          <div className="text-[10px] text-zinc-500 line-clamp-2 mt-0.5">{item.snippet}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Variables */}
              {selectedSkill && SKILL_VARIABLES[selectedSkill] && SKILL_VARIABLES[selectedSkill].length > 0 && (
                <div className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950 space-y-2">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Variables</div>
                  {SKILL_VARIABLES[selectedSkill].map((v) => (
                    <div key={v.key}>
                      <label className="text-[10px] text-zinc-400 block mb-0.5">{v.label}</label>
                      <textarea
                        value={variableValues[v.key] ?? ""}
                        onChange={(e) =>
                          setVariableValues((prev) => ({ ...prev, [v.key]: e.target.value }))
                        }
                        rows={v.autoToday ? 1 : 2}
                        className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-200 resize-y focus:outline-none focus:border-zinc-600"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Message input + Send (pinned to bottom) */}
            <div className="flex gap-2 py-3 border-t border-zinc-800 shrink-0">
              <input
                type="text"
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTest()}
                placeholder={
                  selectedSkill
                    ? `${selectedSkill} 메시지...`
                    : `${selectedAgent.name}에게 질문...`
                }
                disabled={sending}
                className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:border-blue-500 placeholder:text-zinc-600 disabled:opacity-50"
              />
              <button
                onClick={sendTest}
                disabled={!userMessage.trim() || sending}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* ── Results column ── */}
          <div className="flex-1 pl-4 overflow-y-auto space-y-3 pr-1 py-3">
            {results.filter((r) => r.agentId === selectedId).length === 0 && (
              <div className="flex items-center justify-center h-full text-zinc-600">
                <p className="text-sm">Send 후 결과가 여기에 표시됩니다</p>
              </div>
            )}
            {results
              .filter((r) => r.agentId === selectedId)
              .map((r) => (
                <ResultCard
                  key={r.id}
                  result={r}
                  agentName={selectedAgent.name}
                  expanded={expanded[r.id] ?? {}}
                  onToggle={(section) => toggleSection(r.id, section)}
                  sending={sending && !r.responseText && !r.error}
                />
              ))}
            <div ref={resultsEnd} />
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── result card ─────────────────────────────

function ResultCard({
  result,
  agentName,
  expanded,
  onToggle,
  sending,
}: {
  result: TestResult;
  agentName: string;
  expanded: Record<string, boolean>;
  onToggle: (section: string) => void;
  sending: boolean;
}) {
  const done = !!result.responseText || !!result.error;
  const failed = !!result.error;

  return (
    <div
      className={`border rounded-lg bg-zinc-950 overflow-hidden ${
        failed
          ? "border-red-900/60"
          : done
            ? "border-zinc-800"
            : "border-zinc-700 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
      }`}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2 text-xs border-b border-zinc-800/50">
        <span className="font-medium text-zinc-200">{agentName}</span>
        {result.skillId && (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 text-[10px] font-mono">
            {result.skillId}
          </span>
        )}
        {done && result.durationMs !== undefined && (
          <span className="flex items-center gap-1 text-zinc-500 ml-auto">
            <Clock className="w-3 h-3" />
            {formatDuration(result.durationMs)}
          </span>
        )}
        {!done && sending && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 ml-auto" />}
        {done && !failed && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 ml-auto" />}
        {failed && <XCircle className="w-3.5 h-3.5 text-red-400 ml-auto" />}
      </div>

      {/* User message */}
      <div className="px-3 py-2 bg-blue-950/20 text-xs text-zinc-300 whitespace-pre-wrap break-words">
        {result.prompt}
      </div>

      {/* Collapsible sections */}
      <div className="divide-y divide-zinc-800/50">
        {/* Request Body */}
        <CollapsibleSection
          title="Request Body"
          icon={<FileJson className="w-3 h-3" />}
          open={expanded.requestBody}
          onToggle={() => onToggle("requestBody")}
        >
          {result.requestBody ? (
            <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-words">
              {JSON.stringify(result.requestBody, null, 2)}
            </pre>
          ) : (
            <span className="text-zinc-600 italic">Not available</span>
          )}
        </CollapsibleSection>

        {/* System Prompt */}
        <CollapsibleSection
          title="System Prompt"
          icon={<FileText className="w-3 h-3" />}
          open={expanded.systemPrompt}
          onToggle={() => onToggle("systemPrompt")}
        >
          {result.systemPrompt ? (
            <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-words">
              {result.systemPrompt}
            </pre>
          ) : done ? (
            <span className="text-zinc-600 italic">
              {failed ? "Error occurred" : "Not returned (deploy에 debug 모드가 반영되지 않았을 수 있음)"}
            </span>
          ) : (
            <span className="text-zinc-600 italic">Waiting for response...</span>
          )}
        </CollapsibleSection>

        {/* Response */}
        <div className="px-3 py-2">
          <div className="text-[10px] font-medium text-zinc-500 mb-1">Response</div>
          {result.error ? (
            <div className="text-xs text-red-400 whitespace-pre-wrap">{result.error}</div>
          ) : result.responseText ? (
            <div className="text-xs text-zinc-200 whitespace-pre-wrap break-words">{result.responseText}</div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Calling agent...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-3 pb-2 max-h-72 overflow-y-auto">{children}</div>}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
