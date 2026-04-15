"use client";

import { useState, useEffect, useRef } from "react";
import {
  Play,
  FileCode,
  Loader2,
  CheckCircle2,
  XCircle,
  Terminal,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Zap,
} from "lucide-react";

type Kind = "ts" | "py";

interface ScriptInfo {
  name: string;
  file: string;
  kind: Kind;
  description: string;
}

interface LogEntry {
  type: "stdout" | "stderr" | "error" | "info";
  content: string;
}

interface AgentRequest {
  prompt: string;
  variables: Record<string, string>;
  url: string;
}

interface AgentResponse {
  text?: string;
  error?: string;
  ok: boolean;
  duration_ms: number;
}

interface AgentCall {
  key: string;
  step: number | string;
  step_name: string;
  agent_id: string;
  agent_name: string;
  skill: string | null;
  request?: AgentRequest;
  response?: AgentResponse;
}

interface StepCheck {
  name: string;
  ok: boolean;
  note: string;
}

interface StepSummary {
  step: number | string;
  name: string;
  ok?: boolean;
  checks?: StepCheck[];
}

interface PipelineInfo {
  base_url?: string;
  today?: string;
  source_len?: number;
  reporter_id?: string | null;
  manager_id?: string | null;
  all_ok?: boolean;
  started_at?: Date;
  ended_at?: Date;
}

const DEFAULT_BASE_URL = "https://a2a-slack-notion.vercel.app";

export default function ScriptRunner() {
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [selected, setSelected] = useState<ScriptInfo | null>(null);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);

  // Pipeline (Python) view state — indexed by step key so re-ordered events collapse onto the same row.
  const [pipelineInfo, setPipelineInfo] = useState<PipelineInfo>({});
  const [callOrder, setCallOrder] = useState<string[]>([]);
  const [callsByKey, setCallsByKey] = useState<Record<string, AgentCall>>({});
  const [stepSummaries, setStepSummaries] = useState<Record<string, StepSummary>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Terminal view state (for TS scripts + as fallback raw log for Python).
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEnd = useRef<HTMLDivElement>(null);
  const cardsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchScripts();
  }, []);

  useEffect(() => {
    if (selected?.kind === "py") {
      cardsEnd.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      logsEnd.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, callOrder, callsByKey, stepSummaries, selected?.kind]);

  async function fetchScripts() {
    try {
      const res = await fetch("/api/run-script");
      const data = (await res.json()) as ScriptInfo[];
      setScripts(data);
    } catch {
      // ignore
    }
  }

  function resetRunState() {
    setExitCode(null);
    setLogs([]);
    setPipelineInfo({});
    setCallOrder([]);
    setCallsByKey({});
    setStepSummaries({});
    setExpanded({});
  }

  async function runScript(s: ScriptInfo) {
    setRunning(true);
    resetRunState();
    setLogs([{ type: "info", content: `Running ${s.file}…` }]);
    if (s.kind === "py") {
      setPipelineInfo({ started_at: new Date() });
    }

    try {
      const res = await fetch("/api/run-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: s.name,
          kind: s.kind,
          baseUrl: s.kind === "py" ? baseUrl : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to start script");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            handleStreamPayload(payload);
          } catch {
            // skip
          }
        }
      }
    } catch (e) {
      setLogs((prev) => [
        ...prev,
        { type: "error", content: e instanceof Error ? e.message : "Unknown error" },
      ]);
    } finally {
      setRunning(false);
      setPipelineInfo((prev) => ({ ...prev, ended_at: new Date() }));
    }
  }

  function handleStreamPayload(payload: {
    type: "event" | "stdout" | "stderr" | "error" | "exit";
    event?: PipelineEvent;
    content?: string;
    code?: number;
  }) {
    if (payload.type === "exit") {
      setExitCode(payload.code ?? -1);
      return;
    }
    if (payload.type === "event" && payload.event) {
      applyEvent(payload.event);
      return;
    }
    if (payload.type === "stdout" || payload.type === "stderr" || payload.type === "error") {
      const logType: LogEntry["type"] = payload.type;
      const content = payload.content ?? "";
      setLogs((prev) => [...prev, { type: logType, content }]);
    }
  }

  function applyEvent(evt: PipelineEvent) {
    switch (evt.event) {
      case "pipeline-start":
        setPipelineInfo((prev) => ({
          ...prev,
          base_url: evt.base_url,
          today: evt.today,
          source_len: evt.source_len,
        }));
        return;
      case "pipeline-end":
        setPipelineInfo((prev) => ({
          ...prev,
          all_ok: evt.all_ok,
          reporter_id: evt.reporter_id ?? null,
          manager_id: evt.manager_id ?? null,
        }));
        return;
      case "step-start": {
        const key = String(evt.step);
        setStepSummaries((prev) => ({
          ...prev,
          [key]: { step: evt.step as number | string, name: evt.step_name ?? String(evt.step) },
        }));
        return;
      }
      case "step-end": {
        const key = String(evt.step);
        setStepSummaries((prev) => ({
          ...prev,
          [key]: {
            step: evt.step as number | string,
            name: evt.step_name ?? prev[key]?.name ?? String(evt.step),
            ok: evt.ok,
            checks: evt.checks,
          },
        }));
        return;
      }
      case "agent-request": {
        const agentId = evt.agent_id ?? "unknown";
        const key = `${evt.step}::${agentId}::${evt.skill ?? ""}`;
        setCallsByKey((prev) => ({
          ...prev,
          [key]: {
            key,
            step: (evt.step ?? "?") as number | string,
            step_name: evt.step_name ?? "",
            agent_id: agentId,
            agent_name: evt.agent_name ?? agentId,
            skill: evt.skill ?? null,
            request: {
              prompt: evt.prompt ?? "",
              variables: evt.variables ?? {},
              url: evt.url ?? "",
            },
          },
        }));
        setCallOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
        return;
      }
      case "agent-response": {
        const agentId = evt.agent_id ?? "unknown";
        const key = `${evt.step}::${agentId}::${evt.skill ?? ""}`;
        setCallsByKey((prev) => {
          const existing = prev[key];
          if (!existing) return prev;
          return {
            ...prev,
            [key]: {
              ...existing,
              response: {
                text: evt.text,
                error: evt.error,
                ok: evt.ok ?? false,
                duration_ms: evt.duration_ms ?? 0,
              },
            },
          };
        });
        return;
      }
    }
  }

  const kind = selected?.kind ?? "ts";
  const elapsedMs =
    pipelineInfo.started_at
      ? (pipelineInfo.ended_at ?? new Date()).getTime() -
        pipelineInfo.started_at.getTime()
      : 0;

  return (
    <div className="flex h-[calc(100vh-12rem)]">
      {/* Left: Script list */}
      <div className="w-72 border-r border-zinc-800 pr-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
            <FileCode className="w-4 h-4" />
            Scripts
          </h3>
          <button
            onClick={fetchScripts}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        {scripts.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">
            No scripts found.
          </p>
        ) : (
          <div className="space-y-1">
            {scripts.map((s) => {
              const active = selected?.kind === s.kind && selected.name === s.name;
              return (
                <button
                  key={`${s.kind}:${s.name}`}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    active
                      ? "bg-zinc-800 border border-zinc-700"
                      : "hover:bg-zinc-900 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        s.kind === "py"
                          ? "bg-yellow-500/15 text-yellow-300"
                          : "bg-blue-500/15 text-blue-300"
                      }`}
                    >
                      {s.kind.toUpperCase()}
                    </span>
                    <div className="text-sm font-medium truncate">{s.name}</div>
                  </div>
                  {s.description && (
                    <div className="text-xs text-zinc-500 mt-1 line-clamp-2">
                      {s.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: run controls + output */}
      <div className="flex-1 pl-4 flex flex-col min-w-0">
        {/* Run controls */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => selected && runScript(selected)}
              disabled={!selected || running}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg text-sm font-medium transition-colors"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {running ? "Running..." : kind === "py" ? "Test Pipeline" : "Run Script"}
            </button>

            {exitCode !== null && (
              <span
                className={`flex items-center gap-1.5 text-sm ${
                  exitCode === 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {exitCode === 0 ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Exit code: {exitCode}
              </span>
            )}

            {selected && (
              <span className="text-sm text-zinc-500">
                {selected.kind === "py"
                  ? `unblock-pipeline/${selected.file}`
                  : `scripts/${selected.file}`}
              </span>
            )}

            {running && kind === "py" && (
              <span className="text-sm text-zinc-500 ml-auto">
                {formatDuration(elapsedMs)}
              </span>
            )}
          </div>

          {selected?.kind === "py" && (
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="shrink-0">Base URL</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={running}
                className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono focus:outline-none focus:border-zinc-600"
                placeholder={DEFAULT_BASE_URL}
              />
            </label>
          )}
        </div>

        {/* Output pane */}
        {kind === "py" ? (
          <PipelineView
            info={pipelineInfo}
            callOrder={callOrder}
            callsByKey={callsByKey}
            stepSummaries={stepSummaries}
            expanded={expanded}
            onToggle={(key) =>
              setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
            }
            running={running}
            exitCode={exitCode}
            logs={logs}
            cardsEndRef={cardsEnd}
          />
        ) : (
          <TerminalView logs={logs} logsEndRef={logsEnd} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── terminal view (TS) ─────────────────────────────

function TerminalView({
  logs,
  logsEndRef,
}: {
  logs: LogEntry[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <Terminal className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs text-zinc-500">Output</span>
      </div>
      <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-0.5">
        {logs.length === 0 ? (
          <span className="text-zinc-600">
            Select a script and click Run to see output...
          </span>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={
                log.type === "stderr"
                  ? "text-red-400"
                  : log.type === "error"
                    ? "text-red-500"
                    : log.type === "info"
                      ? "text-blue-400"
                      : "text-zinc-300"
              }
              style={{ whiteSpace: "pre-wrap" }}
            >
              {log.content}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

// ───────────────────────────── pipeline view (PY) ─────────────────────────────

function PipelineView({
  info,
  callOrder,
  callsByKey,
  stepSummaries,
  expanded,
  onToggle,
  running,
  exitCode,
  logs,
  cardsEndRef,
}: {
  info: PipelineInfo;
  callOrder: string[];
  callsByKey: Record<string, AgentCall>;
  stepSummaries: Record<string, StepSummary>;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  running: boolean;
  exitCode: number | null;
  logs: LogEntry[];
  cardsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
      {/* Pipeline info banner */}
      {(info.base_url || info.today || info.reporter_id) && (
        <div className="border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-950 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1 shrink-0">
          {info.base_url && (
            <span>
              <span className="text-zinc-500">base:</span>{" "}
              <span className="font-mono text-zinc-300">{info.base_url}</span>
            </span>
          )}
          {info.today && (
            <span>
              <span className="text-zinc-500">today:</span>{" "}
              <span className="text-zinc-300">{info.today}</span>
            </span>
          )}
          {info.reporter_id && (
            <span>
              <span className="text-zinc-500">reporter:</span>{" "}
              <span className="text-zinc-300">{info.reporter_id}</span>
            </span>
          )}
          {info.manager_id && (
            <span>
              <span className="text-zinc-500">manager:</span>{" "}
              <span className="text-zinc-300">{info.manager_id}</span>
            </span>
          )}
          {info.all_ok !== undefined && (
            <span
              className={`ml-auto font-medium ${
                info.all_ok ? "text-green-400" : "text-red-400"
              }`}
            >
              {info.all_ok ? "all ok" : "some checks failed"}
            </span>
          )}
        </div>
      )}

      {/* Agent call cards */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {callOrder.length === 0 && !running && logs.length === 0 && (
          <p className="text-sm text-zinc-600 italic">
            Click &quot;Test Pipeline&quot; to start running. Agent calls will
            appear here as they happen.
          </p>
        )}

        {callOrder.length === 0 && running && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 p-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Warming up…
          </div>
        )}

        {callOrder.map((key) => {
          const call = callsByKey[key];
          if (!call) return null;
          const stepKey = String(call.step);
          const summary = stepSummaries[stepKey];
          const isOpen = expanded[key] ?? false;
          return (
            <AgentCallCard
              key={key}
              call={call}
              summary={summary}
              open={isOpen}
              onToggle={() => onToggle(key)}
            />
          );
        })}

        <div ref={cardsEndRef} />
      </div>

      {/* Raw stdout (collapsed by default) */}
      <div className="shrink-0">
        <button
          onClick={() => setShowRaw((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showRaw ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          Raw output ({logs.length})
          {exitCode !== null && (
            <span className="ml-2 text-zinc-600">exit={exitCode}</span>
          )}
        </button>
        {showRaw && (
          <div className="mt-2 max-h-48 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded p-2 font-mono text-[11px] text-zinc-400 space-y-0.5">
            {logs.map((log, i) => (
              <div
                key={i}
                className={
                  log.type === "stderr"
                    ? "text-red-400"
                    : log.type === "error"
                      ? "text-red-500"
                      : log.type === "info"
                        ? "text-blue-400"
                        : "text-zinc-400"
                }
                style={{ whiteSpace: "pre-wrap" }}
              >
                {log.content}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCallCard({
  call,
  summary,
  open,
  onToggle,
}: {
  call: AgentCall;
  summary?: StepSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const responded = !!call.response;
  const failed = responded && !call.response?.ok;
  return (
    <div
      className={`border rounded-lg bg-zinc-950 overflow-hidden ${
        failed
          ? "border-red-900/60"
          : responded
            ? "border-zinc-800"
            : "border-zinc-700 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
      }`}
    >
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-start gap-2 hover:bg-zinc-900/60 transition-colors text-left"
      >
        <span className="mt-0.5 text-zinc-500 shrink-0">
          {open ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-zinc-500">
              step {call.step}
            </span>
            <span className="text-sm font-medium text-zinc-100">
              {call.agent_name}
            </span>
            {call.skill && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                {call.skill}
              </span>
            )}
            <span className="text-[10px] font-mono text-zinc-500 truncate">
              {call.agent_id}
            </span>
          </div>
          {!open && (
            <div className="mt-1 text-xs text-zinc-400 line-clamp-2 whitespace-pre-wrap">
              {call.response?.error
                ? `Error: ${call.response.error}`
                : call.response?.text
                  ? call.response.text
                  : "Calling…"}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {!responded ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          ) : failed ? (
            <XCircle className="w-4 h-4 text-red-400" />
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-zinc-500">
              <Zap className="w-3 h-3" />
              {formatDuration(call.response?.duration_ms ?? 0)}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-3 py-3 space-y-3">
          {/* Request */}
          {call.request && (
            <div>
              <div className="text-[11px] font-medium text-zinc-500 mb-1">
                Request
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words">
                {call.request.prompt}
              </div>
              {call.request.variables &&
                Object.keys(call.request.variables).length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] text-zinc-500 mb-1">
                      variables
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {JSON.stringify(call.request.variables, null, 2)}
                    </div>
                  </div>
                )}
              {call.request.url && (
                <div className="mt-1 text-[10px] font-mono text-zinc-600 truncate">
                  POST {call.request.url}
                </div>
              )}
            </div>
          )}

          {/* Response */}
          <div>
            <div className="text-[11px] font-medium text-zinc-500 mb-1">
              Response
              {call.response && (
                <span className="ml-2 text-[10px] text-zinc-600">
                  {formatDuration(call.response.duration_ms)}
                </span>
              )}
            </div>
            <div
              className={`rounded p-2 text-xs whitespace-pre-wrap break-words ${
                failed
                  ? "bg-red-950/40 border border-red-900/60 text-red-300"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-200"
              }`}
            >
              {call.response?.error
                ? call.response.error
                : call.response?.text
                  ? call.response.text
                  : "Calling agent…"}
            </div>
          </div>

          {/* Step-end checks (rendered once per step, only on the first call */}
          {summary?.checks && summary.checks.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-zinc-500 mb-1">
                Step checks
              </div>
              <ul className="space-y-0.5">
                {summary.checks.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[11px]"
                  >
                    {c.ok ? (
                      <CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <span className={c.ok ? "text-zinc-300" : "text-zinc-200"}>
                      {c.name}
                      {c.note && (
                        <span className="text-zinc-500 ml-1">— {c.note}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── helpers / types ─────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

interface PipelineEvent {
  event:
    | "pipeline-start"
    | "pipeline-end"
    | "step-start"
    | "step-end"
    | "agent-request"
    | "agent-response";
  step?: number | string;
  step_name?: string;
  // pipeline-start
  base_url?: string;
  today?: string;
  source_len?: number;
  // pipeline-end
  all_ok?: boolean;
  reporter_id?: string | null;
  manager_id?: string | null;
  // step-end
  checks?: StepCheck[];
  ok?: boolean;
  // agent-*
  agent_id?: string;
  agent_name?: string;
  skill?: string | null;
  url?: string;
  prompt?: string;
  variables?: Record<string, string>;
  text?: string;
  error?: string;
  duration_ms?: number;
}
