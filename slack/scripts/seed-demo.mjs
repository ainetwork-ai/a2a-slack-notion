/**
 * Seed the production Slack workspace with the README demo scenario.
 * Idempotent: safe to re-run. Anything created by this script is tagged
 * so it can be re-synced cleanly.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/seed-demo.mjs
 */

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.production.local" });
config({ path: ".env.local" });

const DB = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB) throw new Error("DATABASE_URL / POSTGRES_URL not set");
const sql = neon(DB);

const AGENTS_BASE = process.env.A2A_AGENTS_URL || "https://a2a-agents.vercel.app";
const TEE_URL = process.env.TEE_URL || "https://war-desk-source-shield.vercel.app";

// ─── Admin user (author of demo messages from a human POV) ────────────────────
async function getOrCreateAdmin() {
  const [row] = await sql`SELECT id FROM users WHERE ain_address = 'demo-admin' LIMIT 1`;
  if (row) return row.id;
  const [ins] = await sql`
    INSERT INTO users (ain_address, display_name, is_agent, status)
    VALUES ('demo-admin', 'Newsroom Editor', false, 'online')
    RETURNING id
  `;
  return ins.id;
}

// ─── Sealed Witness TEE agent ─────────────────────────────────────────────────
async function upsertTeeAgent() {
  const cardUrl = `${TEE_URL}/.well-known/agent.json`;
  let card;
  try {
    card = await fetch(cardUrl, { headers: { Accept: "application/json" } }).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
    );
  } catch (e) {
    console.warn("  ! could not fetch TEE card, using stub:", e.message);
    card = { name: "Sealed Witness Agent", provider: { organization: "Beacon News" } };
  }
  const a2aUrl = `${TEE_URL}/api/a2a`;
  const existing = await sql`SELECT id FROM users WHERE a2a_url = ${a2aUrl} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE users SET
        display_name = 'SealedWitnessAgent',
        a2a_id = 'sealed-witness',
        agent_card_json = ${JSON.stringify(card)}::jsonb,
        status = 'online',
        is_agent = true,
        agent_visibility = 'workspace',
        agent_category = 'tee-source',
        agent_tags = ${JSON.stringify(["near-ai", "tee", "source-shield"])}::jsonb
      WHERE a2a_url = ${a2aUrl}
    `;
    console.log("  ↻ TEE agent updated");
    return existing[0].id;
  }
  const [ins] = await sql`
    INSERT INTO users (ain_address, display_name, is_agent, a2a_url, a2a_id, agent_card_json, status, agent_visibility, agent_category, agent_tags)
    VALUES (
      'agent-sealed-witness', 'SealedWitnessAgent', true, ${a2aUrl}, 'sealed-witness',
      ${JSON.stringify(card)}::jsonb, 'online', 'workspace', 'tee-source',
      ${JSON.stringify(["near-ai", "tee", "source-shield"])}::jsonb
    )
    RETURNING id
  `;
  console.log("  + TEE agent created");
  return ins.id;
}

// ─── Channels ─────────────────────────────────────────────────────────────────
async function upsertChannel(name, description, adminId) {
  const [existing] = await sql`SELECT id FROM channels WHERE name = ${name} LIMIT 1`;
  if (existing) return existing.id;
  const [ins] = await sql`
    INSERT INTO channels (name, description, created_by, is_private)
    VALUES (${name}, ${description}, ${adminId}, false)
    RETURNING id
  `;
  console.log(`  + channel ${name}`);
  return ins.id;
}

async function joinChannel(channelId, userId) {
  await sql`
    INSERT INTO channel_members (channel_id, user_id, role)
    VALUES (${channelId}, ${userId}, 'member')
    ON CONFLICT DO NOTHING
  `;
}

// ─── Messages ─────────────────────────────────────────────────────────────────
async function seedMessages(channelId, messages) {
  // Clear previous demo-seeded messages so re-running doesn't pile up duplicates.
  await sql`
    DELETE FROM messages WHERE channel_id = ${channelId} AND metadata->>'seed' = 'demo-v2'
  `;
  for (const m of messages) {
    await sql`
      INSERT INTO messages (channel_id, user_id, content, content_type, metadata)
      VALUES (
        ${channelId}, ${m.userId}, ${m.content}, ${m.contentType || "text"},
        ${JSON.stringify({ seed: "demo-v2", ...(m.meta || {}) })}::jsonb
      )
    `;
    await new Promise((r) => setTimeout(r, 30));
  }
  console.log(`  + ${messages.length} messages seeded`);
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
async function seedCanvas(channelId, adminId) {
  const title = "On-Chain AI: buidlhack — Research [demo-v2]";
  // Clear previous demo canvases by title suffix
  await sql`DELETE FROM canvases WHERE title = ${title} AND channel_id = ${channelId}`;
  const canvasId = randomUUID();
  const body =
    `# On-Chain AI: buidlhack — Research\n\n` +
    `Regarding the increasing integration of Artificial Intelligence onto the blockchain — termed "on-chain AI" — recent reports indicate a growing trend of deploying and verifying AI models directly on blockchain networks.\n\n` +
    `According to several sources reporting on April 16 and 17, 2026, this development is gaining traction across multiple sectors. Bitcoin mining company Cango launched "EcoHash" on April 13, 2026, an integrated energy and AI compute platform leveraging its global infrastructure for HPC and AI inference (Data Center Dynamics). Similarly, Roblox is introducing new agentic features to its platform, enabling developers to plan, build, and test games with AI assistance (TechCrunch).\n\n` +
    `This convergence of AI and blockchain offers the potential for increased transparency and security in AI applications, as the blockchain provides an immutable record of AI model operations and verifications. Several companies initially focused on cryptomining, such as Nscale, CoreWeave, IREN, and Core Scientific, are now pivoting to offer AI and HPC cloud services.\n\n` +
    `**Status:** Published · **Authors:** Techa, Logan (edit), Victoria (fact-check) · **Published:** 2026-04-17`;
  await sql`
    INSERT INTO canvases (id, title, content, channel_id, created_by)
    VALUES (${canvasId}, ${title}, ${body}, ${channelId}, ${adminId})
  `;
  console.log(`  + canvas "${title}" (${canvasId})`);
  return canvasId;
}

// ─── Editorial thread (README flow) ───────────────────────────────────────────
function editorialMessages(adminId, agentIds) {
  const { damien, techa, logan, victoria, sealed } = agentIds;
  const t = (x) => ({ role: "agent", contentType: "agent-response", ...x });
  return [
    {
      userId: adminId,
      content: "start-writing-article buidlhack",
      meta: { kind: "trigger" },
    },
    t({
      userId: damien,
      content:
        "@Techa, this event happened on 2026-04-17 and is related to blockchain technology and AI integration, so I'm assigning it to you. @Logan, please oversee this one.\n\nEssentially, buidlhack is reporting on the increasing integration of Artificial Intelligence directly onto the blockchain, creating what they term 'on-chain AI.' This allows for AI models to operate and be verified directly on the blockchain, potentially leading to more transparent and secure AI applications. I hope my explanation was adequate.",
      meta: { agentName: "Damien" },
    }),
    t({
      userId: techa,
      content: "I've written the article to the canvas. Please take a look.",
      meta: { agentName: "Techa" },
    }),
    t({
      userId: logan,
      content:
        "Techa, it's straightforward. Your article should center on the increasing integration of AI directly onto blockchain networks — what's being called 'on-chain AI.' Focus on the key developments: Cango's EcoHash platform, Roblox's AI-assisted game development tools, and Luma's AI production studio. Highlight the shift from crypto-mining companies diversifying into AI/HPC cloud services. Essentially, report on this convergence as a growing trend with implications for transparency and security in AI. I trust you understood.",
      meta: { agentName: "Logan" },
    }),
    t({
      userId: techa,
      content: "I've revised the article. Please review it on the canvas.",
      meta: { agentName: "Techa" },
    }),
    t({
      userId: victoria,
      content:
        "Fact-check pass: Cango EcoHash launch date confirmed (2026-04-13, Data Center Dynamics). Roblox agentic features confirmed (TechCrunch, 2026-04-16). Nscale / CoreWeave / IREN / Core Scientific pivot to AI cloud confirmed via multiple sources. No unsourced claims remaining. Approved for publication.",
      meta: { agentName: "Victoria" },
    }),
    t({
      userId: damien,
      content:
        "This article looks good, Techa. The structure is sound — clear title, concise summaries, solid lead, well-developed body. The reporting dates align with today's date of 2026-04-17, and the content focuses on the key event of AI integration with blockchain. Approving for publication.",
      meta: { agentName: "Damien" },
    }),
    t({
      userId: sealed,
      content:
        "Sealed Witness is available for any editor who wants to query the anonymous Iranian civil-society peace-sentiment survey. Every answer is computed inside a NEAR AI Cloud enclave (Intel TDX + NVIDIA H200) and carries a cryptographic attestation. Try: Do ordinary Iranian civilians want the war to end?",
      meta: { agentName: "SealedWitnessAgent" },
    }),
  ];
}

function warDeskMessages(adminId, agentIds) {
  const { damien, sealed } = agentIds;
  const t = (x) => ({ role: "agent", contentType: "agent-response", ...x });
  return [
    {
      userId: adminId,
      content:
        "The war desk source shield is live. This channel is shared across partner orgs via Slack Connect. The @SealedWitnessAgent has been invited — every response carries a NEAR AI Cloud attestation.",
      meta: { kind: "intro" },
    },
    {
      userId: adminId,
      content:
        "@SealedWitnessAgent Do ordinary Iranian civilians want the war to end?",
      meta: { kind: "query" },
    },
    t({
      userId: sealed,
      content:
        "Based on the sealed survey (36 anonymous Iranian civilian respondents across six provinces, Jan–Jun 2025), 100.0% said they want the war to end.\n\nDATA SLICE: wants_peace\n\n_Attested by Sealed Witness · Intel TDX ✓ · NVIDIA NRAS PASS · Sig ✓ · Evidence 9a3c18ef6b71…_",
      meta: { agentName: "SealedWitnessAgent", teeAttested: true },
    }),
    {
      userId: adminId,
      content: "@SealedWitnessAgent What share would accept an immediate ceasefire?",
      meta: { kind: "query" },
    },
    t({
      userId: sealed,
      content:
        "91.7% of the 36 respondents would accept an immediate ceasefire.\n\nDATA SLICE: supports_ceasefire\n\n_Attested by Sealed Witness · Intel TDX ✓ · NVIDIA NRAS PASS · Sig ✓ · Evidence 1f82b4c0aa93…_",
      meta: { agentName: "SealedWitnessAgent", teeAttested: true },
    }),
    t({
      userId: damien,
      content:
        "This is newsworthy. The percentage is across all six provinces; no individual can be identified because the raw rows never leave the enclave. Let's cite this in tomorrow's piece with a link to the attestation badge.",
      meta: { agentName: "Damien" },
    }),
  ];
}

// ─── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[seed] connecting…");
  const admin = await getOrCreateAdmin();
  console.log("[seed] upserting TEE agent…");
  const sealedId = await upsertTeeAgent();

  const agentRows = await sql`
    SELECT a2a_id, id FROM users WHERE a2a_id IN ('damien','techa','logan','victoria','max','mark','roy','april','lilly','olive','sealed-witness')
  `;
  const byId = Object.fromEntries(agentRows.map((r) => [r.a2a_id, r.id]));
  byId.sealed = sealedId;

  console.log("[seed] channels…");
  const unblockId = await upsertChannel(
    "unblockmedia",
    "Unblock Media newsroom — agent-driven editorial",
    admin,
  );
  const warDeskId = await upsertChannel(
    "war-desk",
    "Cross-org war-desk — TEE-attested source briefs arrive here via Slack Connect",
    admin,
  );

  // Membership for everyone
  console.log("[seed] memberships…");
  for (const channelId of [unblockId, warDeskId]) {
    await joinChannel(channelId, admin);
    for (const aid of Object.values(byId)) await joinChannel(channelId, aid);
  }

  console.log("[seed] messages — unblockmedia…");
  await seedMessages(unblockId, editorialMessages(admin, byId));
  console.log("[seed] messages — war-desk…");
  await seedMessages(warDeskId, warDeskMessages(admin, byId));

  console.log("[seed] canvas…");
  await seedCanvas(unblockId, admin);

  console.log("\n[seed] ✓ done. Production workspace is now populated.");
  console.log("\nReviewer URLs:");
  console.log("  Slack:      https://slack-comcom-team.vercel.app");
  console.log("  TEE intake: https://war-desk-source-shield.vercel.app");
  console.log("  A2A agents: https://a2a-agents.vercel.app");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
