import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
const AGENTS_DIR = join(process.cwd(), "agents");
export async function listAgents() {
    if (!existsSync(AGENTS_DIR)) {
        return "No agents directory found. Create an agent first with create_agent.";
    }
    const entries = readdirSync(AGENTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    if (entries.length === 0) {
        return "No agents found. Create one with create_agent.";
    }
    const agents = entries.map((entry) => {
        const agentDir = join(AGENTS_DIR, entry.name);
        const pkgPath = join(agentDir, "package.json");
        const cardPath = join(agentDir, "src", "agent-card.ts");
        let name = entry.name;
        let description = "";
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
                name = pkg.name || entry.name;
            }
            catch { }
        }
        if (existsSync(cardPath)) {
            try {
                const content = readFileSync(cardPath, "utf-8");
                const descMatch = content.match(/description:\s*"([^"]+)"/);
                if (descMatch)
                    description = descMatch[1];
            }
            catch { }
        }
        const hasNodeModules = existsSync(join(agentDir, "node_modules"));
        const hasDist = existsSync(join(agentDir, "dist"));
        const hasVercel = existsSync(join(agentDir, ".vercel"));
        return {
            slug: entry.name,
            name,
            description,
            installed: hasNodeModules,
            built: hasDist,
            deployed: hasVercel,
        };
    });
    const lines = ["# A2A Agents\n"];
    for (const agent of agents) {
        const status = [
            agent.installed ? "installed" : "not installed",
            agent.built ? "built" : "",
            agent.deployed ? "deployed" : "",
        ]
            .filter(Boolean)
            .join(", ");
        lines.push(`## ${agent.name} (${agent.slug})`);
        if (agent.description)
            lines.push(`  ${agent.description}`);
        lines.push(`  Status: ${status}`);
        lines.push(`  Path: agents/${agent.slug}`);
        lines.push("");
    }
    return lines.join("\n");
}
