import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createAgent } from "./tools/create-agent.js";
import { testAgent } from "./tools/test-agent.js";
import { deployAgent } from "./tools/deploy-agent.js";
import { listAgents } from "./tools/list-agents.js";
const server = new McpServer({
    name: "a2a-builder",
    version: "0.1.0",
});
// Tool: create_agent
server.tool("create_agent", "Scaffold a new A2A (Agent-to-Agent) protocol agent with Hono server, agent card, and local vLLM (Gemma 4) task handler", {
    name: z.string().describe("Agent name (e.g. 'code-reviewer', 'translator')"),
    description: z.string().describe("What the agent does"),
    skills: z
        .array(z.object({
        id: z.string().describe("Skill ID (e.g. 'review-code')"),
        name: z.string().describe("Skill display name"),
        description: z.string().describe("What this skill does"),
    }))
        .describe("List of skills the agent exposes"),
    model: z
        .string()
        .optional()
        .describe("vLLM model name (default: gemma-4-31B-it)"),
    llmBaseUrl: z
        .string()
        .optional()
        .describe("vLLM base URL (default: http://localhost:8100/v1)"),
    systemPrompt: z
        .string()
        .optional()
        .describe("Custom system prompt for the agent"),
}, async ({ name, description, skills, model, llmBaseUrl, systemPrompt }) => {
    try {
        const result = await createAgent({ name, description, skills, model, llmBaseUrl, systemPrompt });
        return { content: [{ type: "text", text: result }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});
// Tool: test_agent
server.tool("test_agent", "Start an A2A agent locally and run protocol compliance tests (agent card, tasks/send, tasks/get)", {
    name: z.string().describe("Agent slug name"),
    message: z.string().optional().describe("Test message to send (default: 'Hello! What can you do?')"),
    port: z.number().optional().describe("Port to run on (default: 3100)"),
}, async ({ name, message, port }) => {
    try {
        const result = await testAgent({ name, message, port });
        return { content: [{ type: "text", text: result }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});
// Tool: deploy_agent
server.tool("deploy_agent", "Deploy an A2A agent to Vercel and return the agent card JSON URL", {
    name: z.string().describe("Agent slug name"),
    prod: z.boolean().optional().describe("Deploy to production (default: false, creates preview)"),
}, async ({ name, prod }) => {
    try {
        const result = await deployAgent({ name, prod });
        return { content: [{ type: "text", text: result }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});
// Tool: list_agents
server.tool("list_agents", "List all created A2A agents with their status (installed, built, deployed)", {}, async () => {
    try {
        const result = await listAgents();
        return { content: [{ type: "text", text: result }] };
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("A2A Builder MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
