/**
 * Register (or update) the 10 Unblock Media A2A agents in the local DB.
 *
 * Each agent is upserted by a2aUrl so running this script multiple times is safe.
 * It fetches the real agent card from the Vercel deployment to get up-to-date
 * skill definitions.
 *
 * Usage:
 *   node scripts/register-unblock-agents.mjs
 *   # Or with a custom base URL:
 *   BASE_URL=http://localhost:3000 node scripts/register-unblock-agents.mjs
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const BASE_URL = process.env.BASE_URL || "https://a2a-agents.vercel.app";

const AGENTS = [
  { id: "unblock-damien",   name: "Damien",   role: "editor" },
  { id: "unblock-max",      name: "Max",      role: "reporter" },
  { id: "unblock-techa",    name: "Techa",    role: "reporter" },
  { id: "unblock-mark",     name: "Mark",     role: "reporter" },
  { id: "unblock-roy",      name: "Roy",      role: "reporter" },
  { id: "unblock-april",    name: "April",    role: "reporter" },
  { id: "unblock-victoria", name: "Victoria", role: "manager" },
  { id: "unblock-logan",    name: "Logan",    role: "manager" },
  { id: "unblock-lilly",    name: "Lilly",    role: "manager" },
  { id: "unblock-olive",    name: "Olive",    role: "designer" },
];

async function fetchCard(agentId) {
  const url = `${BASE_URL}/api/agents/${agentId}/.well-known/agent.json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch card for ${agentId}: HTTP ${res.status}`);
  return res.json();
}

console.log(`Registering 10 Unblock agents from ${BASE_URL}\n`);

for (const agent of AGENTS) {
  const a2aUrl = `${BASE_URL}/api/agents/${agent.id}`;

  // Fetch real agent card
  let card;
  try {
    card = await fetchCard(agent.id);
    console.log(`  ✓ Fetched card: ${card.name} — ${card.skills?.length ?? 0} skills`);
  } catch (err) {
    console.error(`  ✗ ${agent.id}: ${err.message}`);
    continue;
  }

  const ainAddress = `agent-${agent.id}`;
  const displayName = card.name || agent.name;

  // Upsert by a2a_url (unique)
  const existing = await sql`
    SELECT id FROM users WHERE a2a_url = ${a2aUrl} LIMIT 1
  `;

  const iconUrl = card.iconUrl || null;

  if (existing.length > 0) {
    // Update existing
    await sql`
      UPDATE users SET
        display_name = ${displayName},
        a2a_id = ${agent.id},
        agent_card_json = ${JSON.stringify(card)}::jsonb,
        avatar_url = ${iconUrl},
        status = 'online',
        is_agent = true
      WHERE a2a_url = ${a2aUrl}
    `;
    console.log(`  ↻ Updated: ${agent.id} (${displayName})`);
  } else {
    // Insert new
    await sql`
      INSERT INTO users (ain_address, display_name, is_agent, a2a_url, a2a_id, agent_card_json, avatar_url, status, agent_visibility, agent_category, agent_tags)
      VALUES (
        ${ainAddress},
        ${displayName},
        true,
        ${a2aUrl},
        ${agent.id},
        ${JSON.stringify(card)}::jsonb,
        ${iconUrl},
        'online',
        'workspace',
        ${agent.role},
        ${JSON.stringify(["unblock-media", agent.role])}::jsonb
      )
    `;
    console.log(`  + Created: ${agent.id} (${displayName})`);
  }
}

console.log("\nDone. Verifying:");
const agents = await sql`
  SELECT a2a_id, display_name, a2a_url,
         jsonb_array_length(COALESCE(agent_card_json->'skills', '[]'::jsonb)) as skill_count
  FROM users
  WHERE a2a_id LIKE 'unblock-%'
  ORDER BY a2a_id
`;
console.table(agents);
