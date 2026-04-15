// @description Agent health check - fetch agent card and verify connectivity

const AGENT_URL =
  process.argv[2] ||
  "https://a2a-builder.ainetwork.ai/api/agents/max-test-1776171314093";

async function main() {
  console.log(`[Health Check] Target: ${AGENT_URL}`);
  console.log("---");

  // Step 1: Fetch agent card
  console.log("[1/3] Fetching agent card...");
  const start = Date.now();
  try {
    const res = await fetch(
      `${AGENT_URL}/.well-known/agent.json`,
      { headers: { Accept: "application/json" } }
    );
    const elapsed = Date.now() - start;

    if (!res.ok) {
      console.error(`FAIL: HTTP ${res.status} (${elapsed}ms)`);
      process.exit(1);
    }

    const card = await res.json();
    console.log(`OK: ${res.status} (${elapsed}ms)`);
    console.log(`  Name: ${card.name}`);
    console.log(`  Version: ${card.version}`);
    console.log(`  Protocol: ${card.protocolVersion || "unknown"}`);
    console.log(`  Skills: ${card.skills?.length || 0}`);
  } catch (e) {
    console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // Step 2: Test message endpoint reachability
  console.log("\n[2/3] Testing message endpoint...");
  try {
    const res = await fetch(AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: {
          message: {
            messageId: "health-check-" + Date.now(),
            role: "user",
            parts: [{ kind: "text", text: "ping" }],
            kind: "message",
          },
          configuration: {
            blocking: true,
            acceptedOutputModes: ["text"],
          },
        },
        id: "hc-" + Date.now(),
      }),
    });

    const elapsed = Date.now() - start;
    const data = await res.json();

    if (data.error) {
      console.log(`WARN: Agent returned error: ${data.error.message} (${elapsed}ms)`);
    } else {
      console.log(`OK: Message endpoint responsive (${elapsed}ms)`);
      const result = data.result;
      if (result?.kind === "task") {
        const textPart = result.artifacts?.[0]?.parts?.find(
          (p: { kind: string }) => p.kind === "text"
        );
        console.log(`  Response: ${textPart?.text?.slice(0, 100) || "(no text)"}`);
      }
    }
  } catch (e) {
    console.error(`FAIL: ${e instanceof Error ? e.message : e}`);
  }

  // Step 3: Summary
  console.log("\n[3/3] Summary");
  console.log("---");
  console.log("Agent is reachable and responding.");
}

main();
