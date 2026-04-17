# Integration Points: plan.md → existing slack-a2a code

Maps every component in `plan.md` to a concrete file in the existing
`slack-a2a` repo. Use this as the implementation checklist.

---

## 1) Slash command: `/source-brief`

| Plan section | File to edit | What to add |
|---|---|---|
| MVP user flow §3 step 1–2 | `slack/src/app/api/commands/route.ts` | New command handler for `/source-brief`. Build `PolicyContext` (`request_id`, `purpose_id="journalism_source_protection"`, `legal_basis`, `retention_days=14`, `tee_required=true`). Hand off to Policy Router. |

---

## 2) Provider abstraction + Policy Router

Existing A2A code is provider-agnostic at the wire level (`client.ts` =
JSON-RPC `message/send`). We need a *local* provider abstraction for
inference routing.

| Plan section | File | What to add |
|---|---|---|
| §4 Agent Provider Interface | `slack/src/lib/a2a/providers/types.ts` (NEW) | `AgentProvider` interface: `infer(request, policyContext) → ProviderResult` |
| §4 StandardAgentProvider | `slack/src/lib/a2a/providers/standard.ts` (NEW) | Wraps existing `vllm-handler.ts` path |
| §4 NearAiTeeProvider | `slack/src/lib/a2a/providers/near-ai-tee.ts` (NEW) | OpenAI SDK against `https://qwen35-122b.completions.near.ai/v1`; returns `chat_id`, `signing_address`, raw completion |
| §4 Policy Router | `slack/src/lib/a2a/policy-router.ts` (NEW) | Decides `route=TEE_REQUIRED` vs `route=STANDARD` from `PolicyContext`. War-desk purpose ⇒ TEE_REQUIRED. |

Existing `agent-manager.ts` and `auto-engage.ts` stay unchanged; the new
router slots in *before* they pick a downstream agent for inference.

---

## 3) Attestation verifier

| Plan section | File | What to add |
|---|---|---|
| §5.4 verifier flow | `slack/src/lib/a2a/attestation/verifier.ts` (NEW) | Wraps `dcap-qvl-node` + NVIDIA NRAS HTTP call + response signature check via `/v1/signature/{chat_id}` |
| §5.4 npm deps | `slack/package.json` | Add `dcap-qvl-node`, `ethers` (for ECDSA signing_address recovery), keep existing `openai` |

Reference verifier we mirror: `nearai/nearai-cloud-verifier` (TS variant).

---

## 4) MCP gateway with `PolicyContext`

The existing `mcp/executor.ts` has no policy enforcement — its provider
map is hardcoded and `executeTool` takes only `(serverId, toolName, params)`.
Two non-breaking options:

**Option A (recommended for MVP):** add a sibling `executeWithPolicy`:

| File | Change |
|---|---|
| `slack/src/lib/mcp/executor.ts` | Add `executeWithPolicy(serverId, toolName, params, policy: PolicyContext)`. Validates required policy fields, denies on missing `purpose_id` / disallowed purpose / `tee_required` mismatch / over-retention. Logs to `auditLogs`. Falls through to existing `executeTool` on allow. |
| `slack/src/lib/mcp/policy.ts` (NEW) | `PolicyContext` type + validators + deny reasons enum |
| `slack/src/lib/mcp/providers/newsroom.ts` (NEW) | `slack_thread_read` (delegates to existing `slack.read_thread`), `notion_story_get` (stub returning seed JSON for demo) |
| `slack/src/lib/mcp/executor.ts` providers map | Register `newsroom` server |

**Option B (post-MVP):** modify `ProviderFn` signature to accept policy. Bigger blast radius — defer.

---

## 5) Audit + retention

| Plan section | File | What to add |
|---|---|---|
| §10 audit decisions | `slack/src/lib/db/schema.ts` `auditLogs` table (existing — has `metadata jsonb`) | No schema change needed. Pack `{processing_record_id, attestation_evidence_id, policy_decision, deny_reason, attestation_verified, expires_at}` into `metadata`. Use `action="war_desk_decision"`, `targetType="editorial_brief"`. |
| §10 brief retention | `slack/src/lib/db/schema.ts` (NEW table `editorialBriefs`) | Stores `public_safe_brief`, `hold_back_items`, `verification_checklist`, `source_exposure_risk_score`, `chat_id`, `signing_address`, `expires_at` (14d). Migration `slack/drizzle/0010_war_desk.sql`. |
| §10 purge | `slack/src/app/api/cron/cleanup/route.ts` (existing cron route) — or NEW `slack/src/app/api/cron/purge-war-desk/route.ts` | Delete `editorialBriefs` rows where `expires_at < now()`; insert a `war_desk_purge` row into `auditLogs.metadata`. |

---

## 6) Slack response rendering

| Plan section | File | What to add |
|---|---|---|
| §3 step 8 — badge | Wherever `/source-brief` posts back to Slack (likely `commands/route.ts` directly using existing message API) | Format response with sections + badge string: `TEE: NEAR AI Cloud · Attestation: verified · Signing 0x… · Chat <id>` |

---

## 7) Agent card

| Plan section | File | What to add |
|---|---|---|
| §6 A2A extensions | `slack/src/app/api/a2a/[agentId]/.well-known/agent.json/route.ts` (existing) | When agent has `purpose_scope` containing `journalism_source_protection`, inject the `gdpr` and `near-tee-attestation` extensions matching `near-bounty/agent-card.example.json` |

---

## 8) Demo seed data

| File (NEW) | Purpose |
|---|---|
| `slack/scripts/seed-war-desk.mjs` | Creates `#war-desk` channel, seeds synthetic `incident_hormuz_001` thread, registers the War Desk agent card |

---

## 9) Implementation order (matches plan.md §11)

1. `slack/src/lib/a2a/providers/types.ts` + `near-ai-tee.ts` + `policy-router.ts`
2. `slack/src/app/api/commands/route.ts` — wire `/source-brief`
3. `slack/src/lib/a2a/attestation/verifier.ts` — TDX + NRAS + response-sig
4. `slack/src/lib/mcp/policy.ts` + `executor.ts` (executeWithPolicy)
5. `slack/src/lib/mcp/providers/newsroom.ts`
6. Drizzle `0010_war_desk.sql` + audit/brief persistence
7. `seed-war-desk.mjs` + record demo

---

## 10) What we are *not* changing

- `agent-manager.ts`, `auto-engage.ts`, `builder-agent.ts`, `vllm-handler.ts` — stay as-is
- Existing MCP providers (`slack`, `news`, `polymarket`, `document`) — stay as-is
- A2A wire protocol in `client.ts` — stay as-is

This keeps the MVP additive: one new command, one new provider, one new
verifier, one policy gate, one new MCP server. Everything else is reuse.
