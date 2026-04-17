# Slack-A2A + MCP + NEAR AI TEE Integration Plan

## 1) Goal
Add **MCP** (standardized data/tool access) and **NEAR AI Cloud** (verifiable private inference via Intel TDX + NVIDIA Confidential Compute) to the existing `slack-a2a` project, then demonstrate a realistic newsroom scenario end-to-end.

- Scenario: **War Desk Source Shield — Hormuz Hostage Negotiation Coverage**
- Core value: protect sensitive source material while still producing fast, publishable journalism outputs with cryptographic verification anchored on NEAR.

---

## 2) Scenario Definition

### Context
A newsroom receives sensitive updates in Slack about a hostage case near the Strait of Hormuz. The editorial team must report quickly under public pressure.

### Risk
Raw source messages may contain identity clues, negotiation-sensitive details, or information that could endanger people if published prematurely.

### System Objective
Use TEE-only processing for sensitive editorial tasks and return:
- publish-safe brief,
- hold-back guidance,
- verification checklist,
- attestation status (Intel TDX + NVIDIA NRAS verdict).

No operational/tactical details are generated; this is strictly editorial privacy and verification workflow support.

---

## 3) MVP User Flow (single golden path)

1. Editor runs `/source-brief incident_hormuz_001` in `#war-desk`.
2. Slack handler builds a `PolicyContext` and hands it to the A2A Orchestrator.
3. Policy Router classifies request as `TEE_REQUIRED` (war-desk purpose).
4. `NearAiTeeProvider` calls NEAR AI Cloud via OpenAI-compatible SDK with a fresh 32-byte nonce.
5. MCP tools fetch source material:
   - `newsroom.slack_thread_read`
   - `newsroom.notion_story_get`
6. Inference returns structured editorial output + signing address.
7. `AttestationVerifier`:
   - fetches `/v1/attestation/report` for the model,
   - validates **Intel TDX quote** with `dcap-qvl`,
   - validates **NVIDIA GPU evidence** via NRAS,
   - confirms `report_data` binds the signing key + nonce.
8. On verify success → Slack posts result with badge: `TEE: NEAR AI Cloud · Attestation: verified · Evidence: <hash>`.
9. On verify failure → response is suppressed; Slack posts safe fallback.
10. Audit row written with `processing_record_id`, `attestation_evidence_id`, `expires_at`.

Out of MVP scope (explicit non-goals): Notion write-back, full DSAR UI, multi-region transfer policy, subprocessor registry. These remain in the plan but are not demo-blockers.

---

## 4) Architecture Extension

- `Slack Event Handler` (existing)
- `A2A Orchestrator` (existing)
- `Policy Router` (new)
- `Agent Provider Interface` (new/refactor)
  - `StandardAgentProvider`
  - `NearAiTeeProvider` (NEW — calls NEAR AI Cloud)
- `McpGateway` (new)
  - newsroom tools
  - privacy request tool
- `AttestationVerifier` (new — wraps `dcap-qvl` + NVIDIA NRAS)
- `Audit Store` (new/extended)

---

## 5) NEAR AI Cloud Integration

### 5.1 Why NEAR AI (not Shade Agents)
The Shade Agent Framework is no longer maintained as standalone tooling after 2026-04-19. **NEAR AI Cloud** is the supported path for verifiable confidential inference and is the basis for this submission.

### 5.2 Connection mode: Direct Completions (preferred)
NEAR AI Cloud offers two paths and we choose the simpler trust model:

| Mode | Base URL | TEEs to verify | Latency | Use |
|---|---|---|---|---|
| **Direct completions** | `https://{slug}.completions.near.ai/v1` | 1 (model only) | lower | ✅ MVP |
| Gateway | `https://cloud-api.near.ai/v1` | 2 (gateway + model) | higher | fallback |

For Qwen3.5-122B the slug is `qwen35-122b`. TLS terminates **inside the model TEE** (not at an external load balancer), so prompts are never plaintext outside the enclave. Hardware: 8× NVIDIA H200 + Intel TDX CPUs per Private LLM Node, managed by Private-ML-SDK.

### 5.3 OpenAI SDK compatibility (direct completions)

```ts
// slack/src/lib/a2a/providers/near-ai-tee.ts
import OpenAI from "openai";
import crypto from "node:crypto";

const MODEL_SLUG = "qwen35-122b";              // direct completions slug
const MODEL_ID   = "Qwen/Qwen3.5-122B-A10B"; // OpenAI-compat model id
const BASE_URL   = `https://${MODEL_SLUG}.completions.near.ai/v1`;

const client = new OpenAI({
  apiKey: process.env.NEAR_AI_API_KEY!,
  baseURL: BASE_URL,
});

export async function runTeeInference(opts: {
  systemPrompt: string;
  userContent: string;
}) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const completion = await client.chat.completions.create({
    model: MODEL_ID,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userContent },
    ],
  });
  return { completion, nonce, baseUrl: BASE_URL };
}
```

### 5.4 Attestation + response-signature verification

Two endpoints on the same model TEE:

```
GET  https://qwen35-122b.completions.near.ai/v1/attestation/report
       ?signing_algo=ecdsa&nonce=<hex32>&include_tls_fingerprint=true

GET  https://qwen35-122b.completions.near.ai/v1/signature/{chat_id}
```

Attestation response contains `model_attestations[]` with:
- `signing_address` (TEE public key — must match response signer)
- `intel_quote` (TDX quote)
- `nvidia_payload` (GPU evidence sent to NRAS)

Verifier flow (TS, mirrors `nearai/nearai-cloud-verifier`):
1. `dcap-qvl-node` → validate `intel_quote`; confirm `mr_config` matches the expected docker-compose manifest hash.
2. POST `nvidia_payload` to NVIDIA NRAS → expect verdict `PASS`.
3. Confirm `report_data` binds `signing_address` + nonce + TLS fingerprint.
4. Fetch `/v1/signature/{chat_id}` → verify the response payload was signed by `signing_address`. This proves the bytes Slack received were produced inside the same TEE that the attestation describes.
5. Any step fails → `attestation_verified = false` → response suppressed.

Reference implementation to study before coding: `near-examples/nearai-cloud-verification-example` (Node 18+).

### 5.4 Auth & accounts
- `NEAR_AI_API_KEY` provisioned via `cloud.near.ai/signin`.
- Audit `processing_record_id` stored alongside `attestation_evidence_id` (signing_address + report hash) so any third party can independently re-verify by re-fetching `/v1/attestation/report`.

---

## 6) A2A Extensions (Policy + Trust)

### `gdpr` extension
Declares machine-readable privacy policy metadata: purpose, legal basis, retention, region controls, rights handling endpoint. Schema lives at `https://near-bounty.example/a2a/extensions/gdpr/v1.json`.

### `near-tee-attestation` extension
Declares and enforces verifiable secure execution metadata anchored on NEAR AI Cloud:
- `tee_required`,
- `connection_mode` (`direct_completions` | `gateway`),
- `attestation_endpoint` (`https://{slug}.completions.near.ai/v1/attestation/report`),
- `signature_endpoint` (`https://{slug}.completions.near.ai/v1/signature/{chat_id}`),
- `verifier_implementation` (`nearai-cloud-verifier`),
- `evidence_id` (signing_address + report hash + chat_id),
- `verification_status`,
- fail-closed behavior.

All custom contract fields previously lived under top-level `x-*` keys on the agent card. They are now folded into the extension `params` so the card remains A2A-spec-clean.

---

## 7) MCP Enforcement as Compliance Execution Point

MCP is the policy enforcement point.

### Required `PolicyContext` on every MCP call
- `request_id`
- `purpose_id`
- `legal_basis`
- `retention_days`
- `tee_required`
- `region_policy`
- `minimization_profile`

### Fail-closed rules
- Missing/invalid purpose → deny
- Missing legal basis → deny
- Retention exceeds policy → deny
- `tee_required=true` on non-TEE path → deny
- Region policy mismatch → deny
- Overbroad tool response → truncate or deny

### Retention & deletion
- Persist with `expires_at` (single canonical value: **14 days** for editorial outputs, **30 days** for attestation evidence — see §10).
- Purge expired records.
- Keep purge audit entries.

---

## 8) GDPR + PIPA Compliance Scope (Technical)

This implementation targets enforceable controls for: purpose limitation, data minimization, storage limitation, security of processing, accountability, subject-rights handling, region/transfer policy tracking. Final legal compliance status requires legal/organizational governance review. See `compliance-matrix.md`.

---

## 9) Newsroom Policy Rules (Scenario-Specific)

- Any request under war-desk purpose is `TEE_REQUIRED` by default.
- Content flagged as negotiation-sensitive is routed to `hold_back_items`.
- Single-source high-risk claims are marked `verification_required`.
- If attestation verification fails, output is blocked.
- Raw sensitive notes are not retained long-term (14-day cap).

---

## 10) Canonical Retention Values (single source of truth)

| Data class | TTL |
|---|---|
| Editorial brief output | 14 days |
| Attestation evidence (report hash + signing_address) | 30 days |
| Audit decision log | 30 days |
| Raw sensitive source notes | not retained beyond request |

These values are referenced verbatim in `agent-card.example.json` and `compliance-matrix.md`.

---

## 11) Implementation Phases (narrowed)

### Phase 1 — Routing foundation (Day 1 AM)
1. Refactor provider interface
2. Add policy router
3. Add `/source-brief` command handling

### Phase 2 — NEAR AI Cloud + attestation (Day 1 PM)
4. Implement `NearAiTeeProvider` (OpenAI SDK against `https://qwen35-122b.completions.near.ai/v1` — direct completions)
5. Implement `AttestationVerifier` (TDX via `dcap-qvl-node` + NVIDIA NRAS + `/v1/signature/{chat_id}` response-sig check)
6. Wire fail-closed gating

### Phase 3 — MCP enforcement (Day 2 AM)
7. Enforce `PolicyContext` in MCP gateway
8. Implement 2 deny cases (missing `purpose_id`, `tee_required` on non-TEE path)
9. Persist `expires_at` and audit decisions

### Phase 4 — Demo packaging (Day 2 PM)
10. Synthetic newsroom seed data
11. Record 3-scene demo (success / policy deny / **real** attestation failure via nonce mismatch)

Deferred (post-MVP, called out explicitly): Notion write-back, full DSAR UI, region/transfer policy enforcement, subprocessor registry.

---

## 12) Definition of Done (MVP)

- `/source-brief` works end-to-end against NEAR AI Cloud
- War-desk requests always go through TEE provider
- MCP denies policy-violating calls (≥2 documented denial cases)
- Attestation status (Intel TDX + NVIDIA NRAS verdict) shown in Slack output
- Failed attestation blocks final answer (real failure, not simulated — bad nonce)
- Audit row stores `processing_record_id`, `attestation_evidence_id`, `expires_at`
- README maps each criterion to evidence (logs + screenshots)

---

## 13) References (read before coding)

- NEAR AI Cloud intro: https://docs.near.ai/cloud/introduction/
- Quickstart: https://docs.near.ai/cloud/quickstart/
- **Private inference (gateway vs direct completions, TLS-in-TEE)**: https://docs.near.ai/cloud/private-inference/
- Verification: https://docs.near.ai/cloud/verification/
- Model verification: https://docs.near.ai/cloud/verification/model/
- Chat verification: https://docs.near.ai/cloud/verification/chat/
- Direct completions endpoints: https://completions.near.ai/endpoints
- Verifier (Python + TS): https://github.com/nearai/nearai-cloud-verifier
- Worked example (Node 18+): https://github.com/near-examples/nearai-cloud-verification-example
- Launch post: https://near.ai/blog/introducing-near-ai-cloud-private-chat
