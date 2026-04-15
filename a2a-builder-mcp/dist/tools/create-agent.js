import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { agentPackageJson, agentTsconfig, serverTs, agentCardTsClean, taskHandlerTs, envExample, gitignore, } from "../templates/agent-template.js";
const AGENTS_DIR = join(process.cwd(), "agents");
export async function createAgent(input) {
    const config = {
        name: input.name,
        description: input.description,
        skills: input.skills,
        model: input.model,
        llmBaseUrl: input.llmBaseUrl,
        systemPrompt: input.systemPrompt,
    };
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const agentDir = join(AGENTS_DIR, slug);
    if (existsSync(agentDir)) {
        throw new Error(`Agent "${slug}" already exists at ${agentDir}`);
    }
    // Create directories
    mkdirSync(join(agentDir, "src"), { recursive: true });
    mkdirSync(join(agentDir, "api"), { recursive: true });
    // Write files
    writeFileSync(join(agentDir, "package.json"), agentPackageJson(input.name, input.description));
    writeFileSync(join(agentDir, "tsconfig.json"), agentTsconfig());
    writeFileSync(join(agentDir, "src", "server.ts"), serverTs(config));
    writeFileSync(join(agentDir, "src", "agent-card.ts"), agentCardTsClean(config));
    writeFileSync(join(agentDir, "src", "task-handler.ts"), taskHandlerTs(config));
    writeFileSync(join(agentDir, ".env.example"), envExample());
    writeFileSync(join(agentDir, ".gitignore"), gitignore());
    // Install dependencies
    try {
        execSync("npm install", { cwd: agentDir, stdio: "pipe", timeout: 60000 });
    }
    catch (err) {
        return `Agent "${slug}" created at ${agentDir} but npm install failed: ${err.message}. Run 'cd ${agentDir} && npm install' manually.`;
    }
    return [
        `Agent "${input.name}" created successfully!`,
        ``,
        `Location: ${agentDir}`,
        ``,
        `Files:`,
        `  src/server.ts      — Main A2A server (Hono)`,
        `  src/agent-card.ts  — Agent card definition`,
        `  src/task-handler.ts — Task processing with local vLLM (Gemma 4)`,
        ``,
        `Next steps:`,
        `  1. Ensure vLLM is running (default: localhost:8089)`,
        `  2. Use test_agent tool to verify`,
        `  3. Use deploy_agent tool to deploy to Vercel`,
    ].join("\n");
}
