# War Desk Source Shield

A source walks into a war-desk channel. They're scared. They have information about a hostage situation near the Strait of Hormuz. If what they say leaks — names, locations, operational details — someone could die.

This app lets them talk to an AI journalist. The conversation never leaves the hardware enclave. Not to us, not to NEAR, not to anyone who serves a subpoena.

> *"Most newsroom intake forms ask you to trust the newsroom. This one doesn't ask you to trust anyone. The hardware proves it."*

---

## What actually runs

```
Source opens page → talks to AI journalist
        │
        ▼
NEAR AI Cloud (Intel TDX + NVIDIA H200 Confidential Compute)
  TLS terminates inside the enclave
  plaintext never exists outside the chip
        │
        ▼
Per-response attestation badge (Intel TDX + NVIDIA NRAS verified)
        │
        ▼
Structured brief → posted to #war-desk channel via Slack Connect
        │
        ▼
Editor and reporters in the channel (human + A2A agents)
  pick up the brief and run the story
```

## Endpoints

| Route | What it does |
|-------|-------------|
| `/` | Trauma-informed source intake UI |
| `/api/intake` | POST chat history → NEAR AI Cloud + attestation badge |
| `/api/a2a` | A2A JSON-RPC `message/send` — any A2A client can talk to this agent |
| `/.well-known/agent.json` | Live A2A agent card (`gdpr` + `near-tee-attestation` extensions) |
| `/api/dsar` | Source data deletion request endpoint |
| `/api/health` | Deployment + model status |

## Attestation

Every response comes back with:

```
TEE: NEAR AI Cloud — Intel TDX + NVIDIA H200 CC
intel_tdx:       PASS
nvidia_nras:     PASS
report_data:     bound · nonce + signing key verified
response_sig:    PASS
signing_address: 0x…
```

The badge is green only when all four checks pass. The source can re-verify against Intel and NVIDIA's public attestation services themselves. No one's word required.

If attestation fails for any reason — nonce mismatch, tampered report — the response is suppressed. Fail-closed, by design.

## Why TEE for this specifically

| Risk | Standard cloud LLM | NEAR AI Cloud TEE |
|------|-------------------|-------------------|
| Provider reads the conversation | ✅ Yes (30-day retention typical) | ❌ TLS ends inside the chip |
| RAM dump of the running process | ✅ Possible | ❌ Memory is hardware-encrypted |
| Subpoena produces readable logs | ✅ Yes | ❌ Vendor has nothing to hand over |
| Source must trust vendor's claims | ✅ Trust-me | ❌ Cryptographic proof per response |

## Deploy

```bash
# Vercel — set Root Directory to near-bounty/
NEAR_AI_API_KEY=...   # from cloud.near.ai
AGENT_PUBLIC_URL=...  # your deployment URL

# Local
cd near-bounty
npm install
NEAR_AI_API_KEY=... npm run dev
```

## Slack Connect

The brief output from the source intake is posted into a Slack Connect channel shared between the newsroom and partner orgs. Editors, reporters, and A2A agents on both sides can see and act on it — without any org having to trust the other's infrastructure. The attestation travels with the brief.
