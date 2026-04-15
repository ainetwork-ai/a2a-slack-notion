// @description Send a test message to an agent and display the full response

const AGENT_URL =
  process.argv[2] ||
  "https://a2a-builder.ainetwork.ai/api/agents/max-test-1776171314093";
const MESSAGE = process.argv[3] || "Hello! Can you introduce yourself?";

async function main() {
  console.log(`[Send Message]`);
  console.log(`  Agent: ${AGENT_URL}`);
  console.log(`  Message: "${MESSAGE}"`);
  console.log("---");

  const body = {
    jsonrpc: "2.0",
    method: "message/send",
    params: {
      message: {
        messageId: "test-" + Date.now(),
        role: "user",
        parts: [{ kind: "text", text: MESSAGE }],
        kind: "message",
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ["text/plain", "text"],
      },
    },
    id: "test-" + Date.now(),
  };

  console.log("[Request]");
  console.log(JSON.stringify(body, null, 2));
  console.log("---");

  const start = Date.now();
  try {
    const res = await fetch(AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const elapsed = Date.now() - start;
    const data = await res.json();

    console.log(`[Response] (${elapsed}ms)`);
    console.log(JSON.stringify(data, null, 2));

    if (data.error) {
      console.error(`\nError: ${data.error.message}`);
      process.exit(1);
    }

    // Extract text
    const result = data.result;
    if (result?.kind === "task") {
      const textPart = result.artifacts?.[0]?.parts?.find(
        (p: { kind: string }) => p.kind === "text"
      );
      console.log(`\n[Extracted Text]\n${textPart?.text || "(no text)"}`);
    } else if (result?.parts) {
      const textPart = result.parts.find(
        (p: { kind: string }) => p.kind === "text"
      );
      console.log(`\n[Extracted Text]\n${textPart?.text || "(no text)"}`);
    }
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

main();
