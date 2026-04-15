import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { script } = body;

  if (!script || typeof script !== "string") {
    return new Response(
      JSON.stringify({ error: "script name is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Sanitize: only allow alphanumeric, dash, underscore
  if (!/^[\w-]+$/.test(script)) {
    return new Response(
      JSON.stringify({ error: "Invalid script name" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const scriptsDir = path.join(process.cwd(), "scripts");
  const scriptPath = path.join(scriptsDir, `${script}.ts`);

  if (!fs.existsSync(scriptPath)) {
    return new Response(
      JSON.stringify({ error: `Script not found: ${script}.ts` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn("npx", ["tsx", scriptPath], {
        cwd: process.cwd(),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (data: Buffer) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "stdout", content: data.toString() })}\n\n`
          )
        );
      });

      child.stderr.on("data", (data: Buffer) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "stderr", content: data.toString() })}\n\n`
          )
        );
      });

      child.on("close", (code) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "exit", code })}\n\n`
          )
        );
        controller.close();
      });

      child.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`
          )
        );
        controller.close();
      });
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

export async function GET() {
  const scriptsDir = path.join(process.cwd(), "scripts");
  if (!fs.existsSync(scriptsDir)) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const files = fs
    .readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => {
      const content = fs.readFileSync(path.join(scriptsDir, f), "utf-8");
      const descMatch = content.match(/\/\/\s*@description\s+(.*)/);
      return {
        name: f.replace(/\.ts$/, ""),
        file: f,
        description: descMatch ? descMatch[1].trim() : "",
      };
    });

  return new Response(JSON.stringify(files), {
    headers: { "Content-Type": "application/json" },
  });
}
