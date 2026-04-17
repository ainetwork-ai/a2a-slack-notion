# Compliance Matrix (GDPR vs Korea PIPA)

This document compares GDPR and Korea PIPA controls in practical terms for the
`slack-a2a + A2A extensions + MCP + NEAR AI Cloud TEE` architecture.
Final legal compliance is contingent on legal/organizational review.

---

## 1) Common Architectural Building Blocks
- **A2A extensions**: declare processing purpose, legal basis, retention
- **MCP gateway**: enforce policy at call time (purpose, minimization, retention, rights)
- **NEAR AI Cloud TEE**: protect sensitive computation with Intel TDX + NVIDIA Confidential Compute, plus attestation evidence
- **Audit store**: record policy decisions, execution outcomes, verification status

---

## 2) Requirement Comparison Matrix

| Topic | GDPR | Korea PIPA | Implementation control (A2A / MCP / NEAR AI TEE) | Evidence (demo / audit) | MVP? |
|---|---|---|---|---|---|
| Purpose limitation | Art.5(1)(b) | Purpose-of-use restriction | `purpose_id` required; mismatch → deny | `policy_decision=deny` log | ✅ |
| Data minimization | Art.5(1)(c) | Minimum collection principle | `minimization_profile` allowlist | Returned-field log | ✅ |
| Storage limitation | Art.5(1)(e) | Retention/destruction management | `retention_days`, `expires_at`, purge job | Purge audit row | ✅ |
| Integrity / confidentiality | Art.5(1)(f), Art.32 | Safety measures | NEAR AI Cloud TEE enforced; Intel TDX + NVIDIA NRAS verify; fail-closed | `attestation_verified=true/false` log | ✅ |
| Accountability | Art.5(2) | Management responsibility / records | Processing record id + decision log | `processing_record_id` | ✅ |
| Subject rights | Art.15 / 16 / 17 | Access / correction / deletion / suspension | `dsar_execute` minimal path | DSAR ticket sample | ⏳ (post-MVP) |
| Privacy by design / default | Art.25 | Default-protective design intent | Newsroom channel default `tee_required=true` | Default policy snapshot | ✅ |
| Records of processing | Art.30 | Internal management plan / records | Standardized request-response metadata | Audit report extract | ⏳ (post-MVP) |
| Cross-border transfer | Chapter V | Cross-border transfer controls | `region_policy`, transfer flag | `transfer_region` field | ⏳ (post-MVP) |
| Processor / sub-processor mgmt | Processor / Subprocessor management | Outsourcing / third-party provision | Tool registry holds processor metadata | Sub-processor mapping table | ⏳ (post-MVP) |

Legend: ✅ = required for MVP demo, ⏳ = declared in metadata but not demo-blocking.

---

## 3) MVP Required Controls (≤5, demo-blocking)

- [ ] A2A request carries `purpose_id`, `legal_basis`, `retention_days`
- [ ] MCP blocks calls missing required policy fields (fail-closed) — ≥2 deny cases captured
- [ ] Sensitive requests force `tee_required=true` and route to NEAR AI Cloud
- [ ] NEAR AI Cloud attestation (Intel TDX + NVIDIA NRAS) verified before response release; failure blocks output
- [ ] Audit log records `policy_decision`, `attestation_verified`, `processing_record_id`, `expires_at`

Retention values used: see `plan.md` §10 (briefs 14d, evidence 30d).

---

## 4) NEAR AI Cloud Trust Mapping

| Control claim | Where it lives | How to verify independently |
|---|---|---|
| TEE platform | `near-tee-attestation.params.tee_platform` (`near_ai_cloud`) | Re-fetch `/v1/attestation/report` for the model |
| Hardware | `tee_hardware = [intel_tdx, nvidia_confidential_compute]` | `dcap-qvl` on `intel_quote`; NRAS on `nvidia_payload` |
| Key binding | `tee.signing_address` + `report_data` | Verifier confirms `report_data` binds signing key + nonce |
| Evidence retention | `evidence_retention_days = 30` | Audit row `expires_at` |

---

## 5) Recommended External Messaging

- "This system is technically designed to enforce the core principles of GDPR and PIPA — purpose limitation, minimization, storage limitation, and security of processing — at runtime via MCP and NEAR AI Cloud TEE attestation."
- "Final legal compliance is determined together with the organization's contracts, notices, consent flows, and governance."
