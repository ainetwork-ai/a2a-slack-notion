// @description Test multiple agents in sequence - pass URLs as comma-separated args

const DEFAULT_URLS = [
  "https://a2a-builder.ainetwork.ai/api/agents/max-test-1776171314093",
];

const urls = process.argv[2] ? process.argv[2].split(",") : DEFAULT_URLS;
const MESSAGE = process.argv[3] || "Hello, what can you do?";

interface AgentResult {
  url: string;
  name: string;
  status: "ok" | "error";
  responseTime: number;
  response?: string;
  error?: string;
}

async function testAgent(url: string): Promise<AgentResult> {
  const start = Date.now();
  const trimmed = url.trim().replace(/\/$/, "");

  try {
    // Fetch card
    const cardRes = await fetch(`${trimmed}/.well-known/agent.json`);
    if (!cardRes.ok) throw new Error(`Card fetch failed: ${cardRes.status}`);
    const card = await cardRes.json();

    // Send message
    const msgRes = await fetch(trimmed, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: {
          message: {
            messageId: "multi-" + Date.now(),
            role: "user",
            parts: [{ kind: "text", text: MESSAGE }],
            kind: "message",
          },
          configuration: {
            blocking: true,
            acceptedOutputModes: ["text"],
          },
        },
        id: "multi-" + Date.now(),
      }),
    });

    const data = await msgRes.json();
    const elapsed = Date.now() - start;

    if (data.error) {
      return {
        url: trimmed,
        name: card.name,
        status: "error",
        responseTime: elapsed,
        error: data.error.message,
      };
    }

    const result = data.result;
    let text = "(no text)";
    if (result?.kind === "task") {
      const p = result.artifacts?.[0]?.parts?.find(
        (p: { kind: string }) => p.kind === "text"
      );
      if (p) text = p.text;
    } else if (result?.parts) {
      const p = result.parts.find(
        (p: { kind: string }) => p.kind === "text"
      );
      if (p) text = p.text;
    }

    return {
      url: trimmed,
      name: card.name,
      status: "ok",
      responseTime: elapsed,
      response: text.slice(0, 200),
    };
  } catch (e) {
    return {
      url: trimmed,
      name: "unknown",
      status: "error",
      responseTime: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  console.log(`[Multi-Agent Test]`);
  console.log(`  Agents: ${urls.length}`);
  console.log(`  Message: "${MESSAGE}"`);
  console.log("===\n");

  const results: AgentResult[] = [];

  for (const url of urls) {
    console.log(`Testing: ${url.trim()}...`);
    const result = await testAgent(url);
    results.push(result);

    if (result.status === "ok") {
      console.log(`  OK: ${result.name} (${result.responseTime}ms)`);
      console.log(`  Response: ${result.response}`);
    } else {
      console.log(`  FAIL: ${result.error} (${result.responseTime}ms)`);
    }
    console.log("");
  }

  // Summary
  console.log("=== Summary ===");
  const ok = results.filter((r) => r.status === "ok").length;
  console.log(`${ok}/${results.length} agents responded successfully`);
  console.log(
    `Avg response time: ${Math.round(results.reduce((a, r) => a + r.responseTime, 0) / results.length)}ms`
  );
}

main();
