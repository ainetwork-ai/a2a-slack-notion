# Near Bounty: 85+ Score Execution Checklist (Newsroom Scenario)

Scenario baseline: **War Desk Source Shield — Hormuz Hostage Negotiation Coverage**

This checklist is a **2-day sprint** plan to convert architecture into verifiable runtime proof anchored on **NEAR AI Cloud** (Intel TDX + NVIDIA Confidential Compute).

> **Scoring caveat**: the 0–100 numbers below are **self-estimated** based on a typical bounty rubric (Innovation / Impact / Technical / Privacy / Presentation). They are not pulled from an official judge sheet. Treat them as internal targets, not promises. If the official rubric is published, replace this section.

---

## 0) Score Baseline and Target

- Estimated current score (mostly planning/docs): **~63/100** (self-estimate)
- Target after implementation + demo assets: **85+/100** (self-estimate)
- Winning strategy: prove real enforcement and trust guarantees, not just claim them. Every scoring item below requires a captured artifact.

---

## Day 1 — Core Runtime + Trust Controls

## 1) End-to-End Command Path
- [ ] Implement `/source-brief incident_hormuz_001`
- [ ] Route `Slack -> Policy Router -> NearAiTeeProvider -> Slack Response`
- [ ] Confirm one successful command run against NEAR AI Cloud (`Qwen/Qwen3.5-122B-A10B`)

**Evidence**
- [ ] Trace log screenshot
- [ ] Slack output screenshot with structured newsroom fields

---

## 2) MCP Policy Enforcement (Fail-Closed)
- [ ] Require `PolicyContext` on every tool call
- [ ] Enforce `purpose_id=journalism_source_protection`
- [ ] Enforce `legal_basis` and retention maximum (30d cap)
- [ ] Enforce `tee_required=true` for war-desk paths

**Required deny cases (MVP minimum: 2)**
- [ ] Missing `purpose_id` → denied
- [ ] `tee_required=true` routed to non-TEE provider → denied

(Stretch: invalid `legal_basis` → denied)

**Evidence**
- [ ] One allow audit log
- [ ] Two deny audit logs with explicit `deny_reason`

---

## 3) Attestation Gate (NEAR AI Cloud — direct completions)
- [ ] Use base URL `https://qwen35-122b.completions.near.ai/v1`
- [ ] Fetch `/v1/attestation/report?signing_algo=ecdsa&nonce=<hex32>&include_tls_fingerprint=true`
- [ ] Verify Intel TDX quote with `dcap-qvl-node`
- [ ] Verify NVIDIA H200 evidence via NRAS (`verdict=PASS`)
- [ ] Confirm `report_data` binds `signing_address` + nonce + TLS fingerprint
- [ ] Fetch `/v1/signature/{chat_id}` and verify the response payload signature
- [ ] Block final response if any check fails

**Evidence**
- [ ] Success screenshot: `Attestation: verified · Response signature: verified` with signing_address + report hash + chat_id
- [ ] **Real** failure screenshot: nonce-mismatch path, response blocked

---

## Day 2 — Compliance Ops + Presentation

## 4) Persistence + Retention (slimmed)
- [ ] Persist `processing_record_id`, `attestation_evidence_id` (signing_address + report hash)
- [ ] Auto-set `expires_at` per §10 of `plan.md` (briefs=14d, evidence=30d)
- [ ] Purge job removes expired rows; emits purge audit entry

**Evidence**
- [ ] DB row screenshot showing `expires_at`
- [ ] Purge log entry

> Notion write-back is deferred (post-MVP, called out in `plan.md` §11).

---

## 5) Source-Safety Output Controls
- [ ] Output includes `public_safe_brief`
- [ ] Output includes `hold_back_items`
- [ ] Output includes `verification_checklist`
- [ ] Source identity clues are redacted before any non-TEE log path sees them

**Evidence**
- [ ] Before/after sample showing redaction effect

---

## 6) Demo Narrative (3 Minutes)

### Scene A — Trusted newsroom run
- [ ] `/source-brief` produces publish-safe output
- [ ] Show verification checklist + NEAR AI attestation badge

### Scene B — Policy violation denied
- [ ] Trigger request missing `purpose_id`
- [ ] Show MCP deny + audit proof

### Scene C — **Real** attestation failure blocked
- [ ] Send mismatched nonce to verifier
- [ ] Show fail-closed behavior; verifier log shows `nonce_mismatch_in_report_data`

---

## 7) Self-Estimated Judge Criteria Mapping (rubric not official)

| Dimension | Self-Weight | What to show |
|---|---|---|
| Innovation | 30 | A2A policy ext + MCP enforcement + NEAR AI Cloud attestation in one Slack flow |
| Impact | 25 | Real newsroom pain: source protection under deadline pressure |
| Technical Excellence | 20 | Runtime-proven policy denials + Intel TDX + NVIDIA NRAS gating |
| Privacy Design | 15 | Purpose limitation, minimization, retention TTLs, rights-request path |
| Presentation | 10 | Crisp 3-scene demo with real (not simulated) failure |

(Replace this table with the official rubric if/when published.)

---

## 8) 85+ Release Gate (self-estimated)
- [ ] `/source-brief` end-to-end works against NEAR AI Cloud
- [ ] At least 2 deny-policy proofs captured
- [ ] **Real** attestation fail-closed proof (nonce mismatch, not mocked)
- [ ] Retention metadata persisted (`expires_at` matches §10 of `plan.md`)
- [ ] Redaction/hold-back outputs demonstrated
- [ ] README maps directly to criteria with evidence links

If all boxes are complete with concrete artifacts, expected score range is internally estimated at **85–90+**. This is a self-projection, not a guarantee.
