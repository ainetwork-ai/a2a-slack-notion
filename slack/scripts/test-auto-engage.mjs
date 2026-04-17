/**
 * End-to-end test of channel auto-engagement.
 *
 * Scenario:
 *   1. Create a channel with NewsAnalyst + Writer agents as members.
 *   2. Set engagementLevel=3 (proactive) for both.
 *   3. User posts: "트럼프 관련 뉴스 트윗 작성해줘"
 *   4. Both agents should auto-engage via LLM intent analysis.
 *   5. Watch the message stream and verify each agent responds.
 */

import pg from "pg";
import crypto from "crypto";

const BASE = "http://localhost:3004";
const DB_URL = "postgresql://slack:slack@localhost:5433/slack_a2a";

// 1. Login as a test user
const pk = crypto.randomBytes(32).toString("hex");
const loginRes = await fetch(`${BASE}/api/auth/key-login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ privateKey: pk, displayName: "AutoEngageTester" }),
});
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
const me = (await loginRes.json()).user;
const headers = { "Content-Type": "application/json", Cookie: cookie };
console.log("✓ Logged in:", me.displayName, me.id);

// 2. Look up test agents in DB
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const agents = await client.query(`
  SELECT id, display_name FROM users
  WHERE is_agent = true AND display_name IN ('BitcoinNewsResearcher', 'CryptoArticleWriter')
  LIMIT 2
`);
if (agents.rows.length < 2) {
  console.log("\nNeed at least 2 test agents. Existing agents:");
  const all = await client.query(`SELECT display_name FROM users WHERE is_agent = true LIMIT 20`);
  console.log(all.rows.map(r => r.display_name).join(", "));
  process.exit(1);
}
const [agent1, agent2] = agents.rows;
console.log(`✓ Found agents: ${agent1.display_name}, ${agent2.display_name}`);

// 3. Find/get workspace
const [ws] = (await client.query(`SELECT id FROM workspaces LIMIT 1`)).rows;
console.log(`✓ Workspace: ${ws.id}`);

// 4. Create fresh channel
const channelName = `auto-engage-${Date.now().toString(36)}`;
const chRes = await fetch(`${BASE}/api/channels`, {
  method: "POST", headers,
  body: JSON.stringify({ name: channelName, workspaceId: ws.id, isPrivate: false }),
});
const channel = await chRes.json();
console.log(`✓ Channel #${channel.name} (${channel.id}) created`);

// 5. Add agents to channel + set engagementLevel=3 (proactive)
for (const a of [agent1, agent2]) {
  await client.query(
    `INSERT INTO channel_members (channel_id, user_id, role, engagement_level)
     VALUES ($1, $2, 'member', 3)
     ON CONFLICT (channel_id, user_id) DO UPDATE SET engagement_level = 3, auto_response_count = 0, last_auto_response_at = NULL`,
    [channel.id, a.id]
  );
  console.log(`  + ${a.display_name} joined (engagementLevel=3)`);
}

// 6. Post user message
console.log(`\n→ Posting: "비트코인 뉴스 하나 요약해서 트윗 드래프트 써줘"`);
const msgRes = await fetch(`${BASE}/api/channels/${channel.id}/messages`, {
  method: "POST", headers,
  body: JSON.stringify({ content: "비트코인 뉴스 하나 요약해서 트윗 드래프트 써줘" }),
});
console.log(`User msg status: ${msgRes.status}`);

// 7. Poll for responses over 90s
console.log("\n⏳ Watching for agent responses...\n");
const seenAgentMsgs = new Set();
const start = Date.now();
while (Date.now() - start < 90000) {
  await new Promise(r => setTimeout(r, 3000));
  const msgs = (await client.query(
    `SELECT m.id, m.content, m.metadata, u.display_name, u.is_agent, m.created_at
     FROM messages m JOIN users u ON u.id = m.user_id
     WHERE m.channel_id = $1 ORDER BY m.created_at`,
    [channel.id]
  )).rows;

  for (const m of msgs) {
    if (!m.is_agent || seenAgentMsgs.has(m.id)) continue;
    seenAgentMsgs.add(m.id);
    const elapsed = ((new Date(m.created_at).getTime() - start) / 1000).toFixed(1);
    const chain = m.metadata?.chainDepth ?? "?";
    console.log(`[+${elapsed}s] ${m.display_name} (chain=${chain})`);
    console.log(`  ${m.content.slice(0, 300).replace(/\n/g, " ")}`);
    console.log();
  }

  if (seenAgentMsgs.size >= 2) {
    console.log(`✓ Both agents responded. Done.`);
    break;
  }
}

console.log(`\nTotal agent messages: ${seenAgentMsgs.size}`);
await client.end();
