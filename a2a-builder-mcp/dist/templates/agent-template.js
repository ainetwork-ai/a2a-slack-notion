// Template strings for generating A2A agent projects
export function agentPackageJson(name, description) {
    return JSON.stringify({
        name: `a2a-agent-${name}`,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
            dev: "tsx watch src/server.ts",
            build: "tsc",
            start: "node dist/server.js",
        },
        dependencies: {
            openai: "^4.78.0",
            hono: "^4.7.0",
            "@hono/node-server": "^1.14.0",
        },
        devDependencies: {
            tsx: "^4.19.0",
            typescript: "^5.7.0",
            "@types/node": "^22.0.0",
        },
    }, null, 2);
}
export function agentTsconfig() {
    return JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            outDir: "dist",
            rootDir: "src",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
        },
        include: ["src"],
        exclude: ["node_modules", "dist"],
    }, null, 2);
}
export function agentCardJson(config, url) {
    const baseUrl = url || "http://localhost:3100";
    return JSON.stringify({
        name: config.name,
        description: config.description,
        url: baseUrl,
        version: "0.1.0",
        capabilities: {
            streaming: false,
            pushNotifications: false,
            stateTransitionHistory: false,
        },
        authentication: null,
        defaultInputModes: ["text"],
        defaultOutputModes: ["text"],
        skills: config.skills.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            tags: [],
            examples: [],
        })),
    }, null, 2);
}
export function serverTs(config) {
    return `import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { agentCard } from "./agent-card.js";
import { handleTaskSend, handleTaskGet } from "./task-handler.js";

const app = new Hono();

app.use("*", cors());

// Agent Card discovery
app.get("/.well-known/agent.json", (c) => {
  const baseUrl = \`\${c.req.header("x-forwarded-proto") || "http"}://\${c.req.header("host")}\`;
  return c.json(agentCard(baseUrl));
});

// JSON-RPC 2.0 endpoint
app.post("/", async (c) => {
  const body = await c.req.json();
  const { method, id, params } = body;

  try {
    let result: unknown;
    switch (method) {
      case "tasks/send":
        result = await handleTaskSend(params);
        break;
      case "tasks/get":
        result = await handleTaskGet(params);
        break;
      default:
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: \`Method not found: \${method}\` },
        });
    }
    return c.json({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err.message || "Internal error" },
    });
  }
});

const port = parseInt(process.env.PORT || "3100");
console.log(\`A2A Agent "${config.name}" running on http://localhost:\${port}\`);
console.log(\`Agent card: http://localhost:\${port}/.well-known/agent.json\`);
serve({ fetch: app.fetch, port });
`;
}
export function agentCardTs(config) {
    return `export function agentCard(baseUrl: string) {
  return ${agentCardJson(config, "${baseUrl}")
        .replace('"${baseUrl}"', "`${baseUrl}`")};
}
`;
}
// We need a cleaner approach for the agent card template
export function agentCardTsClean(config) {
    const skills = JSON.stringify(config.skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        tags: [],
        examples: [],
    })), null, 4);
    return `export function agentCard(baseUrl: string) {
  return {
    name: ${JSON.stringify(config.name)},
    description: ${JSON.stringify(config.description)},
    url: baseUrl,
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    authentication: null,
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    skills: ${skills},
  };
}
`;
}
export function taskHandlerTs(config) {
    const model = config.model || "gemma-4-31B-it";
    const baseUrl = config.llmBaseUrl || "http://localhost:8100/v1";
    const systemPrompt = config.systemPrompt ||
        `You are ${config.name}. ${config.description}. Respond helpfully and concisely.`;
    return `import OpenAI from "openai";

const llm = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || ${JSON.stringify(baseUrl)},
  apiKey: "not-needed",
});

const MODEL = process.env.LLM_MODEL || ${JSON.stringify(model)};

interface Task {
  id: string;
  status: { state: string; message?: { role: string; parts: { type: string; text: string }[] } };
  artifacts?: { parts: { type: string; text: string }[] }[];
}

const tasks = new Map<string, Task>();

export async function handleTaskSend(params: any): Promise<Task> {
  const taskId = params.id || crypto.randomUUID();
  const userMessage = params.message?.parts
    ?.filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("\\n") || "";

  const task: Task = {
    id: taskId,
    status: { state: "working" },
  };
  tasks.set(taskId, task);

  try {
    const response = await llm.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        { role: "system", content: ${JSON.stringify(systemPrompt)} },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content || "";

    task.status = {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ type: "text", text }],
      },
    };
    task.artifacts = [{ parts: [{ type: "text", text }] }];
    tasks.set(taskId, task);
    return task;
  } catch (err: any) {
    task.status = {
      state: "failed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: \`Error: \${err.message}\` }],
      },
    };
    tasks.set(taskId, task);
    return task;
  }
}

export async function handleTaskGet(params: any): Promise<Task> {
  const task = tasks.get(params.id);
  if (!task) {
    throw new Error(\`Task not found: \${params.id}\`);
  }
  return task;
}
`;
}
export function vercelJson() {
    return JSON.stringify({
        buildCommand: "npm run build",
        outputDirectory: "dist",
        framework: null,
        rewrites: [{ source: "/(.*)", destination: "/api/index" }],
    }, null, 2);
}
export function vercelApiHandler() {
    return `import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { agentCard } from "../src/agent-card.js";
import { handleTaskSend, handleTaskGet } from "../src/task-handler.js";

const app = new Hono().basePath("/api");

app.use("*", cors());

app.get("/.well-known/agent.json", (c) => {
  const baseUrl = \`https://\${c.req.header("host")}\`;
  return c.json(agentCard(baseUrl));
});

app.post("/", async (c) => {
  const body = await c.req.json();
  const { method, id, params } = body;

  try {
    let result: unknown;
    switch (method) {
      case "tasks/send":
        result = await handleTaskSend(params);
        break;
      case "tasks/get":
        result = await handleTaskGet(params);
        break;
      default:
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: \`Method not found: \${method}\` },
        });
    }
    return c.json({ jsonrpc: "2.0", id, result });
  } catch (err: any) {
    return c.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err.message || "Internal error" },
    });
  }
});

export default handle(app);
`;
}
export function envExample() {
    return `# Local vLLM server (no API key needed)
LLM_BASE_URL=http://localhost:8100/v1
LLM_MODEL=gemma-4-31B-it
`;
}
export function gitignore() {
    return `node_modules/
dist/
.vercel/
.env
.env.local
`;
}
