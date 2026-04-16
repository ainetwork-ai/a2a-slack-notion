import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// Dashboard runs from `a2a/a2a-dashboard/`. Sibling pipeline directory
// (containing Python runners) lives at `a2a/unblock-pipeline/`.
const PIPELINE_DIR = path.resolve(process.cwd(), "..", "unblock-pipeline");
const SCRIPTS_DIR = path.join(process.cwd(), "scripts");

type Kind = "ts" | "py";

interface ScriptInfo {
  name: string;
  file: string;
  kind: Kind;
  description: string;
  hasEvents?: boolean;
}

function readTsScripts(): ScriptInfo[] {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map<ScriptInfo>((f) => {
      const content = fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf-8");
      const descMatch = content.match(/\/\/\s*@description\s+(.*)/);
      return {
        name: f.replace(/\.ts$/, ""),
        file: f,
        kind: "ts",
        description: descMatch ? descMatch[1].trim() : "",
      };
    });
}

function readPyScripts(): ScriptInfo[] {
  if (!fs.existsSync(PIPELINE_DIR)) return [];
  return fs
    .readdirSync(PIPELINE_DIR)
    .filter((f) => f.endsWith(".py"))
    .map<ScriptInfo>((f) => {
      // Pull the first triple-quoted docstring as description (first line only).
      const content = fs.readFileSync(path.join(PIPELINE_DIR, f), "utf-8");
      const docMatch = content.match(/"""\s*([^\n]*)/);
      return {
        name: f.replace(/\.py$/, ""),
        file: f,
        kind: "py",
        description: docMatch ? docMatch[1].trim() : "",
        hasEvents: content.includes("json-events"),
      };
    });
}

export async function GET() {
  const scripts = [...readTsScripts(), ...readPyScripts()];
  return new Response(JSON.stringify(scripts), {
    headers: { "Content-Type": "application/json" },
  });
}

// Only allow simple filenames to avoid path injection.
const NAME_RE = /^[\w-]+$/;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { script, kind = "ts", baseUrl } = body as {
    script?: string;
    kind?: Kind;
    baseUrl?: string;
  };

  if (!script || typeof script !== "string" || !NAME_RE.test(script)) {
    return new Response(
      JSON.stringify({ error: "Invalid script name" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let scriptPath: string;
  let cmd: string;
  let args: string[];
  let cwd: string;

  if (kind === "py") {
    scriptPath = path.join(PIPELINE_DIR, `${script}.py`);
    if (!fs.existsSync(scriptPath)) {
      return new Response(
        JSON.stringify({ error: `Python script not found: ${script}.py` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    cmd = "python3";
    // Only pass --json-events if the script supports it (has the flag in its source).
    const pySource = fs.readFileSync(scriptPath, "utf-8");
    const supportsJsonEvents = pySource.includes("json-events");
    args = supportsJsonEvents ? [scriptPath, "--json-events"] : [scriptPath];
    if (baseUrl && typeof baseUrl === "string" && /^https?:\/\//.test(baseUrl)) {
      args.push("--base-url", baseUrl);
    }
    cwd = PIPELINE_DIR;
  } else {
    scriptPath = path.join(SCRIPTS_DIR, `${script}.ts`);
    if (!fs.existsSync(scriptPath)) {
      return new Response(
        JSON.stringify({ error: `Script not found: ${script}.ts` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    cmd = "npx";
    args = ["tsx", scriptPath];
    cwd = process.cwd();
  }

  const encoder = new TextEncoder();
  const EVENT_PREFIX = "__EVENT__";

  let child: ReturnType<typeof spawn> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn(cmd, args, {
        cwd,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child = proc;
      // stdio is piped above, so these streams are non-null at runtime.
      const childStdout = proc.stdout!;
      const childStderr = proc.stderr!;

      // stdout is line-oriented (both for raw prints and __EVENT__<JSON>).
      // Buffer and split per-newline so we can classify each line.
      let stdoutBuf = "";
      childStdout.on("data", (data: Buffer) => {
        stdoutBuf += data.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        for (const raw of lines) {
          if (raw.startsWith(EVENT_PREFIX)) {
            const jsonPart = raw.slice(EVENT_PREFIX.length);
            try {
              const evt = JSON.parse(jsonPart);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "event", event: evt })}\n\n`
                )
              );
              continue;
            } catch {
              // fall through to treat as stdout
            }
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "stdout", content: raw + "\n" })}\n\n`
            )
          );
        }
      });

      childStderr.on("data", (data: Buffer) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "stderr", content: data.toString() })}\n\n`
          )
        );
      });

      proc.on("close", (code) => {
        if (stdoutBuf) {
          // Flush trailing partial line if any.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "stdout", content: stdoutBuf })}\n\n`
            )
          );
          stdoutBuf = "";
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "exit", code })}\n\n`)
        );
        controller.close();
      });

      proc.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`
          )
        );
        controller.close();
      });
    },
    cancel() {
      // Client disconnected — kill the child so we don't orphan long-running pipelines.
      if (child && !child.killed) {
        child.kill("SIGTERM");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
