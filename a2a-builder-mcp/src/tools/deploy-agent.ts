import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const AGENTS_DIR = join(process.cwd(), "agents");

export interface DeployAgentInput {
  name: string;
  prod?: boolean;
}

export async function deployAgent(input: DeployAgentInput): Promise<string> {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const agentDir = join(AGENTS_DIR, slug);

  if (!existsSync(agentDir)) {
    throw new Error(`Agent "${slug}" not found at ${agentDir}`);
  }

  // Check vercel CLI
  try {
    execSync("which vercel", { stdio: "pipe" });
  } catch {
    throw new Error("Vercel CLI not found. Install with: npm i -g vercel");
  }

  const results: string[] = [];

  // Ensure vercel.json exists for the agent
  const vercelJsonPath = join(agentDir, "vercel.json");
  if (!existsSync(vercelJsonPath)) {
    const vercelConfig = {
      buildCommand: "npx tsc",
      installCommand: "npm install",
      framework: null,
      functions: {
        "api/**/*.ts": {
          runtime: "@vercel/node@3",
        },
      },
      rewrites: [
        { source: "/.well-known/agent.json", destination: "/api/index" },
        { source: "/(.*)", destination: "/api/index" },
      ],
    };
    writeFileSync(vercelJsonPath, JSON.stringify(vercelConfig, null, 2));
    results.push("Created vercel.json");
  }

  // Ensure api/index.ts exists (Vercel serverless function)
  const apiDir = join(agentDir, "api");
  const apiIndexPath = join(apiDir, "index.ts");
  if (!existsSync(apiIndexPath)) {
    const apiHandler = generateVercelHandler(agentDir);
    writeFileSync(apiIndexPath, apiHandler);
    results.push("Created api/index.ts (Vercel serverless handler)");
  }

  // Deploy
  const deployCmd = input.prod ? "vercel --prod --yes" : "vercel --yes";
  results.push(`Running: ${deployCmd}`);

  try {
    const output = execSync(deployCmd, {
      cwd: agentDir,
      stdio: "pipe",
      timeout: 120000,
      env: { ...process.env },
    }).toString();

    // Extract URL from vercel output
    const urlMatch = output.match(/(https:\/\/[^\s]+\.vercel\.app)/);
    const deployedUrl = urlMatch?.[1] || output.trim().split("\n").pop()?.trim();

    if (deployedUrl) {
      results.push(`\nDeployed successfully!`);
      results.push(`URL: ${deployedUrl}`);
      results.push(`Agent Card: ${deployedUrl}/.well-known/agent.json`);

      // Verify agent card is accessible
      try {
        const cardRes = await fetch(`${deployedUrl}/.well-known/agent.json`);
        if (cardRes.ok) {
          const card = await cardRes.json();
          results.push(`\nAgent card verified:`);
          results.push(`  Name: ${card.name}`);
          results.push(`  Description: ${card.description}`);
          results.push(`  Skills: ${card.skills?.map((s: any) => s.name).join(", ")}`);
        } else {
          results.push(`\nWarning: Agent card returned ${cardRes.status} — deployment may still be propagating.`);
        }
      } catch {
        results.push(`\nNote: Could not verify agent card yet. Wait a moment and check manually.`);
      }
    } else {
      results.push(`\nDeploy output:\n${output}`);
    }
  } catch (err: any) {
    throw new Error(`Deploy failed: ${err.stderr?.toString() || err.message}`);
  }

  return results.join("\n");
}

function generateVercelHandler(agentDir: string): string {
  // Read agent-card.ts and task-handler.ts to inline them
  return `import { Hono } from "hono";
import { handle } from "hono/vercel";
import { cors } from "hono/cors";
import { agentCard } from "../src/agent-card.js";
import { handleTaskSend, handleTaskGet } from "../src/task-handler.js";

export const config = { runtime: "nodejs" };

const app = new Hono();

app.use("*", cors());

app.get("/.well-known/agent.json", (c) => {
  const proto = c.req.header("x-forwarded-proto") || "https";
  const host = c.req.header("host") || "localhost";
  return c.json(agentCard(\`\${proto}://\${host}\`));
});

app.post("/*", async (c) => {
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
