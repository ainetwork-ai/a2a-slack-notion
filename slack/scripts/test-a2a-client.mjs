/**
 * End-to-end A2A interop test using @a2a-js/sdk's A2AClient.
 *
 *  1. Discover the agent card from the well-known URL.
 *  2. Send a message/send JSON-RPC call.
 *  3. Print the response.
 *
 * Run:  node scripts/test-a2a-client.mjs
 */

import { A2AClient } from "@a2a-js/sdk/client";

const AGENT_URL = "http://localhost:3004/api/a2a/rpsplayer";

console.log(`→ Connecting to agent at ${AGENT_URL}`);
const client = await A2AClient.fromCardUrl(`${AGENT_URL}/.well-known/agent-card.json`);

const card = await client.getAgentCard();
console.log(`\n✓ Discovered agent: ${card.name}`);
console.log(`  protocol: ${card.protocolVersion}  version: ${card.version}`);
console.log(`  skills: ${card.skills.map((s) => s.name).join(", ")}`);
console.log(`  url: ${card.url}`);

console.log(`\n→ Sending "rock" via message/send...`);
const res = await client.sendMessage({
  message: {
    messageId: crypto.randomUUID(),
    role: "user",
    parts: [{ kind: "text", text: "rock" }],
  },
});

console.log(`\n✓ Response:`);
console.log(JSON.stringify(res, null, 2));
