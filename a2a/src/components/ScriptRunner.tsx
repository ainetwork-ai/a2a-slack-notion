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
} from "lucide-react";

interface ScriptInfo {
  name: string;
  file: string;
  description: string;
}

interface LogEntry {
  type: "stdout" | "stderr" | "exit" | "error" | "info";
  content: string;
  timestamp: Date;
}

export default function ScriptRunner() {
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const logsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchScripts();
  }, []);

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function fetchScripts() {
    try {
      const res = await fetch("/api/run-script");
      const data = await res.json();
      setScripts(data);
    } catch {
      // ignore
    }
  }

  async function runScript(name: string) {
    setRunning(true);
    setExitCode(null);
    setLogs([
      {
        type: "info",
        content: `Running ${name}.ts...`,
        timestamp: new Date(),
      },
    ]);

    try {
      const res = await fetch("/api/run-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: name }),
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
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "exit") {
                setExitCode(data.code ?? -1);
              } else {
                setLogs((prev) => [
                  ...prev,
                  {
                    type: data.type,
                    content: data.content || "",
                    timestamp: new Date(),
                  },
                ]);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (e) {
      setLogs((prev) => [
        ...prev,
        {
          type: "error",
          content: e instanceof Error ? e.message : "Unknown error",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

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
            No scripts found. Add .ts files to the scripts/ directory.
          </p>
        ) : (
          <div className="space-y-1">
            {scripts.map((s) => (
              <button
                key={s.name}
                onClick={() => setSelected(s.name)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selected === s.name
                    ? "bg-zinc-800 border border-zinc-700"
                    : "hover:bg-zinc-900 border border-transparent"
                }`}
              >
                <div className="text-sm font-medium">{s.name}</div>
                {s.description && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {s.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Output */}
      <div className="flex-1 pl-4 flex flex-col">
        {/* Run button */}
        <div className="flex items-center gap-3 mb-3">
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
            {running ? "Running..." : "Run Script"}
          </button>

          {exitCode !== null && (
            <span
              className={`flex items-center gap-1.5 text-sm ${exitCode === 0 ? "text-green-400" : "text-red-400"}`}
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
              scripts/{selected}.ts
            </span>
          )}
        </div>

        {/* Terminal output */}
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
            <Terminal className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-500">Output</span>
          </div>
          <div className="p-4 overflow-y-auto h-full font-mono text-xs space-y-0.5">
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
                >
                  {log.content}
                </div>
              ))
            )}
            <div ref={logsEnd} />
          </div>
        </div>
      </div>
    </div>
  );
}
