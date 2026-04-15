import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
const AGENTS_DIR = join(process.cwd(), "agents");
const runningServers = new Map();
async function waitForServer(url, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok)
                return true;
        }
        catch { }
        await new Promise((r) => setTimeout(r, 300));
    }
    return false;
}
export async function testAgent(input) {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const agentDir = join(AGENTS_DIR, slug);
    if (!existsSync(agentDir)) {
        throw new Error(`Agent "${slug}" not found at ${agentDir}`);
    }
    const port = input.port || 3100;
    const baseUrl = `http://localhost:${port}`;
    const results = [];
    // Start the server
    let server;
    let serverWasRunning = false;
    try {
        // Check if server is already running
        const alreadyRunning = await waitForServer(`${baseUrl}/.well-known/agent.json`, 1000);
        if (alreadyRunning) {
            serverWasRunning = true;
            results.push(`Server already running on port ${port}`);
        }
        else {
            results.push(`Starting agent server on port ${port}...`);
            server = spawn("npx", ["tsx", "src/server.ts"], {
                cwd: agentDir,
                env: { ...process.env, PORT: String(port) },
                stdio: "pipe",
            });
            runningServers.set(slug, server);
            const ready = await waitForServer(`${baseUrl}/.well-known/agent.json`, 15000);
            if (!ready) {
                throw new Error("Server failed to start within 15 seconds");
            }
            results.push(`Server started successfully`);
        }
        // Test 1: Agent Card
        results.push(`\n--- Test 1: Agent Card ---`);
        const cardRes = await fetch(`${baseUrl}/.well-known/agent.json`);
        if (!cardRes.ok) {
            results.push(`FAIL: Agent card returned ${cardRes.status}`);
        }
        else {
            const card = await cardRes.json();
            results.push(`PASS: Agent card found`);
            results.push(`  Name: ${card.name}`);
            results.push(`  Skills: ${card.skills?.map((s) => s.name).join(", ") || "none"}`);
        }
        // Test 2: tasks/send
        results.push(`\n--- Test 2: tasks/send ---`);
        const testMessage = input.message || "Hello! What can you do?";
        const sendRes = await fetch(baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "test-1",
                method: "tasks/send",
                params: {
                    id: "test-task-1",
                    message: {
                        role: "user",
                        parts: [{ type: "text", text: testMessage }],
                    },
                },
            }),
        });
        if (!sendRes.ok) {
            results.push(`FAIL: tasks/send returned ${sendRes.status}`);
        }
        else {
            const sendBody = await sendRes.json();
            if (sendBody.error) {
                results.push(`FAIL: ${sendBody.error.message}`);
            }
            else {
                const state = sendBody.result?.status?.state;
                const text = sendBody.result?.status?.message?.parts?.[0]?.text || "(no text)";
                results.push(`PASS: Task state = ${state}`);
                results.push(`  Response: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);
            }
        }
        // Test 3: tasks/get
        results.push(`\n--- Test 3: tasks/get ---`);
        const getRes = await fetch(baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "test-2",
                method: "tasks/get",
                params: { id: "test-task-1" },
            }),
        });
        if (!getRes.ok) {
            results.push(`FAIL: tasks/get returned ${getRes.status}`);
        }
        else {
            const getBody = await getRes.json();
            if (getBody.error) {
                results.push(`FAIL: ${getBody.error.message}`);
            }
            else {
                results.push(`PASS: Task retrieved, state = ${getBody.result?.status?.state}`);
            }
        }
        // Test 4: Unknown method
        results.push(`\n--- Test 4: Unknown method ---`);
        const unknownRes = await fetch(baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "test-3",
                method: "tasks/unknown",
                params: {},
            }),
        });
        const unknownBody = await unknownRes.json();
        if (unknownBody.error?.code === -32601) {
            results.push(`PASS: Correctly returns method-not-found error`);
        }
        else {
            results.push(`FAIL: Expected error code -32601`);
        }
        results.push(`\n--- Summary ---`);
        const passCount = results.filter((r) => r.startsWith("PASS")).length;
        const failCount = results.filter((r) => r.startsWith("FAIL")).length;
        results.push(`${passCount} passed, ${failCount} failed`);
    }
    finally {
        if (server && !serverWasRunning) {
            server.kill("SIGTERM");
            runningServers.delete(slug);
            results.push(`\nServer stopped.`);
        }
    }
    return results.join("\n");
}
