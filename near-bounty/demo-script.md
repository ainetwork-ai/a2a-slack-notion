# Demo Script (3 Minutes)
## Project: War Desk Source Shield

## Objective
Demonstrate a newsroom workflow where sensitive source material is processed by **NEAR AI Cloud** (Intel TDX + NVIDIA Confidential Compute) with policy enforcement via MCP and trust evidence via independent attestation verification.

Scenario context: hostage-related reporting near the Strait of Hormuz. The demo focuses on source protection and editorial safety, not operational details.

---

## Setup (Before Recording)
- Slack channel: `#war-desk`
- Demo command: `/source-brief incident_hormuz_001`
- `NEAR_AI_API_KEY` set
- Connection mode: **direct completions**, base URL `https://qwen35-122b.completions.near.ai/v1`, model `Qwen/Qwen3.5-122B-A10B`
- Log panel visible (policy decisions + Intel TDX + NVIDIA NRAS verdicts + response signature check)
- Seed synthetic source notes (no real personal data)
- Verifier process imported from `nearai/nearai-cloud-verifier` (TS variant) and wired into the orchestrator

---

## Scene 1 — Trusted newsroom run (0:00–1:10)

### On-screen action
1. In Slack, run `/source-brief incident_hormuz_001`.
2. Show response payload sections:
   - `public_safe_brief`
   - `hold_back_items`
   - `verification_checklist`
   - `source_exposure_risk_score`
3. Highlight badge:
   - `TEE: NEAR AI Cloud — direct completions (Intel TDX + NVIDIA H200 CC)`
   - `Attestation: verified · Response signature: verified`
   - `Signing address: 0x…`
   - `Chat ID: <id> · Evidence ID: <report-hash>`

### Narration
"This is a real newsroom flow under deadline pressure. Sensitive source material is never handled in a normal path. Our policy router marks this as TEE-required and routes it to a NEAR AI Cloud direct completions endpoint — TLS terminates inside the model TEE, so prompts are never plaintext outside the enclave. We then independently verify the Intel TDX quote and the NVIDIA NRAS verdict, and confirm the response itself was signed by the same TEE."

### Proof point to show
- Trace line `route=TEE_REQUIRED · provider=near_ai_cloud · mode=direct_completions`
- Verifier log: `intel_tdx=PASS · nvidia_nras=PASS · report_data_bound=true · response_sig=PASS`

---

## Scene 2 — Policy violation denied (1:10–2:00)

### On-screen action
1. Trigger a request with invalid policy context (e.g., missing `purpose_id`).
2. Show MCP deny response.
3. Open logs showing:
   - `policy_decision=deny`
   - `deny_reason=missing_purpose_id`
4. Trigger second deny: `tee_required=true` against the standard provider path.
   - `deny_reason=tee_required_on_non_tee_provider`

### Narration
"Compliance is not just declared in metadata. MCP enforces it at runtime. If required policy fields are missing or if a TEE-required request is routed to a non-TEE provider, the call is blocked by default."

### Proof point to show
- Two deny log entries with explicit reasons
- No downstream model output after denial

---

## Scene 3 — Attestation failure fail-closed (2:00–2:40)

### On-screen action
1. Trigger a request with a tampered nonce: the verifier sends a different nonce than the one used in the inference request.
2. The verifier rejects because `report_data` no longer binds the inference nonce.
3. Show that final newsroom output is suppressed.
4. Display safe fallback message in Slack.

### Narration
"This is not a simulated failure. We send a mismatched nonce to the NEAR AI attestation endpoint. The Intel TDX report data no longer binds the inference request, so the verifier rejects it. Even though the model returned content, we do not release it. This is fail-closed behavior, by design."

### Proof point to show
- Verifier log: `attestation_verified=false · reason=nonce_mismatch_in_report_data`
- Final answer withheld; Slack shows fallback

---

## Closing (2:40–3:00)

### Narration
"Our architecture combines A2A policy extensions, MCP enforcement, and NEAR AI Cloud TEE attestation into one auditable newsroom workflow. Editors get fast briefs, while source protection is cryptographically verifiable on Intel TDX and NVIDIA Confidential Compute — not a trust-me promise."

### Final on-screen checklist
- [x] TEE-only route to NEAR AI Cloud for high-risk editorial requests
- [x] MCP policy deny on invalid context (≥2 cases)
- [x] Real attestation fail-closed gating (not simulated)
- [x] Retention metadata and audit logging

---

## Backup Q&A (Optional)

### Q1: Why NEAR AI Cloud and not Shade Agents?
A: The Shade Agent Framework is no longer maintained as standalone tooling after 2026-04-19. NEAR AI Cloud is the supported confidential inference path and ships with first-party Intel TDX + NVIDIA NRAS verification.

### Q2: How does the OpenAI SDK fit in?
A: NEAR AI Cloud is OpenAI-compatible. We use the standard `openai` SDK with `baseURL=https://qwen35-122b.completions.near.ai/v1` (direct completions). The only additions on top are fetching `/v1/attestation/report` and `/v1/signature/{chat_id}` and running the verifier.

### Q2b: Why direct completions instead of the gateway?
A: Direct completions has a simpler trust model — only one TEE (the model TEE) needs to be verified, and TLS binds to the attestation via `include_tls_fingerprint=true`. The gateway path is supported as a fallback in the agent card.

### Q3: How is "Scene 3 is real" provable?
A: The verifier source is `nearai/nearai-cloud-verifier` — judges can re-run it locally against our captured `signing_address` and a wrong nonce and see the same rejection.

### Q4: What compliance controls are actually enforced?
A: Purpose limitation, minimization, retention (single source of truth in `plan.md` §10), deny-by-default policy checks, auditable decisions, and a minimal rights-request path.

### Q5: What is stored long-term?
A: Structured brief outputs (14d), attestation evidence and audit decisions (30d). Raw sensitive source notes are not retained beyond the request.
