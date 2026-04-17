/**
 * Update newsroom agent skill instructions to use canvas section tools.
 *
 * Before: agents write full article body as a chat message.
 * After:  agents write to canvas_update_section + canvas_set_status,
 *         and post a one-line chat signal only.
 *
 * Usage:
 *   node scripts/update-newsroom-skill-instructions.mjs [POSTGRES_URL]
 */

import pg from "pg";

const DB_URL = process.argv[2] || process.env.POSTGRES_URL || "postgresql://slack:slack@localhost:5433/slack_a2a";
const c = new pg.Client({ connectionString: DB_URL });
await c.connect();

// ── New skill instructions ────────────────────────────────────────────────────

const REPORTER_INSTRUCTION = `\
Given inputs { topic: string, lang?: "ko"|"en" (default "ko"), canvasId?: string }, write a news article draft.

Steps:
1. Call [TOOL_CALL: news:search | query=<topic>, limit=5] to gather recent articles.
2. Synthesize 2-3 sources into a cohesive draft (under 400 words).
3. Include source attributions inline.
4. If canvasId is provided, save the draft to canvas:
   [TOOL_CALL: slack:canvas_update_section | canvasId=<canvasId>, section=draft, content=<full markdown article>, status=complete]
   [TOOL_CALL: slack:canvas_set_status | canvasId=<canvasId>, status=draft]
5. Post a SHORT one-line chat message — DO NOT paste the full article in chat:
   "초안 완성 (~N자) — Editor 검토 부탁드립니다."

Output format for step 5 only (one sentence). The actual article goes to canvas, not chat.`;

const EDITOR_INSTRUCTION = `\
Given inputs { draft: string, canvasId?: string }, edit the draft for publication.

Steps:
1. If canvasId is provided, read the current draft from canvas:
   [TOOL_CALL: slack:canvas_read_section | canvasId=<canvasId>, section=draft]
   Use the canvas version if available (more current than the draft input).
2. Edit for: sharper headline, tighter lead, better flow, no redundancy or passive voice.
   Keep all verified facts and source attributions intact.
3. If canvasId is provided, save the edited version:
   [TOOL_CALL: slack:canvas_update_section | canvasId=<canvasId>, section=edits, content=<full edited article>, status=complete]
   [TOOL_CALL: slack:canvas_set_status | canvasId=<canvasId>, status=edited]
4. Post a SHORT one-line chat message — DO NOT paste the full article in chat:
   "편집 완료 — FactChecker 검증 부탁드립니다."

Output for step 4 only (one sentence). The edited article goes to canvas.`;

const FACTCHECKER_INSTRUCTION = `\
Given inputs { article: string, canvasId?: string }, fact-check the article.

Steps:
1. If canvasId is provided, read the edited article from canvas:
   [TOOL_CALL: slack:canvas_read_section | canvasId=<canvasId>, section=edits]
   Use the canvas version if available (more current than the article input).
2. Identify 3-5 specific factual claims (numbers, dates, names, events).
3. For each, run [TOOL_CALL: news:search | query=<specific terms>].
4. Classify each claim: [VERIFIED] / [PARTIAL] / [UNVERIFIED].
5. Compute verdict: "verified" if ≥60% verified/partial, else "needs-revision".
6. Write the full fact-check report to canvas:
   [TOOL_CALL: slack:canvas_update_section | canvasId=<canvasId>, section=fact-check, content=<markdown table + verdict>, status=complete]
   [TOOL_CALL: slack:canvas_set_status | canvasId=<canvasId>, status=fact-checked]
7. Post a SHORT chat message:
   "팩트체크 완료: X/Y verified — Publisher 발행 검토 부탁드립니다." (or "수정 필요: <issue>")

Output for step 7 only. The full report goes to canvas.`;

const PUBLISHER_INSTRUCTION = `\
Given inputs { article: string, verdict: string, canvasId?: string }, make a publication decision.

Steps:
1. If canvasId is provided, read the fact-check report:
   [TOOL_CALL: slack:canvas_read_section | canvasId=<canvasId>, section=fact-check]
2. Read the edited article:
   [TOOL_CALL: slack:canvas_read_section | canvasId=<canvasId>, section=edits]
   Use canvas versions if available.
3. Decision rules:
   - PUBLISH if verdict status = "verified" or ≥60% verified/partial.
   - HOLD if verdict indicates unverified critical claims.
4. On PUBLISH:
   [TOOL_CALL: slack:canvas_update_section | canvasId=<canvasId>, section=final, content=<full final article>, status=complete]
   [TOOL_CALL: slack:canvas_set_status | canvasId=<canvasId>, status=published]
   Then post: "**[PUBLISHED ✅]** <headline> — 캔버스에 최종본 저장 완료."
5. On HOLD:
   [TOOL_CALL: slack:canvas_set_status | canvasId=<canvasId>, status=draft]
   Then post: "**[HOLD ⚠️]** <reason> — @Reporter 수정 부탁드립니다: <issues>"

Output is the one-line status message only. Full article content goes to canvas.`;

// ── Map agent display_name → (skillId, new instruction) ──────────────────────

const UPDATES = [
  { displayName: "Reporter",    skillId: "draft-article",    instruction: REPORTER_INSTRUCTION },
  { displayName: "Editor",      skillId: "edit-draft",       instruction: EDITOR_INSTRUCTION },
  { displayName: "FactChecker", skillId: "verify-article",   instruction: FACTCHECKER_INSTRUCTION },
  { displayName: "Publisher",   skillId: "finalize-article", instruction: PUBLISHER_INSTRUCTION },
];

for (const { displayName, skillId, instruction } of UPDATES) {
  // 1. Find agent
  const { rows: agents } = await c.query(
    `SELECT id, agent_card_json FROM users WHERE display_name = $1 AND is_agent = true LIMIT 1`,
    [displayName]
  );
  if (!agents.length) {
    console.log(`⚠  ${displayName} not found — skipping`);
    continue;
  }
  const agent = agents[0];
  const card = agent.agent_card_json || {};

  // 2. Update the matching skill's instruction in agentCardJson
  const skills = Array.isArray(card.skills) ? card.skills : [];
  let updated = false;
  const newSkills = skills.map((s) => {
    if (s.id === skillId) {
      updated = true;
      return { ...s, instruction };
    }
    return s;
  });

  if (!updated) {
    console.log(`⚠  ${displayName}: skill "${skillId}" not found in card — skipping`);
    continue;
  }

  await c.query(
    `UPDATE users SET agent_card_json = $1 WHERE id = $2`,
    [JSON.stringify({ ...card, skills: newSkills }), agent.id]
  );

  // 3. Also update agent_skill_configs if exists
  await c.query(
    `UPDATE agent_skill_configs SET instruction = $1 WHERE agent_id = $2 AND skill_id = $3`,
    [instruction, agent.id, skillId]
  );

  console.log(`✓  ${displayName} (${skillId}) updated`);
}

await c.end();
console.log("\nDone. Newsroom agents now write to canvas sections.");
