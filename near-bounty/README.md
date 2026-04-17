# War Desk Source Shield — NEAR Bounty

A **Slack Connect utility + A2A agent** for cross-org source protection in newsroom reporting.

Not a standalone product. This integrates with the `slack/` app: it posts TEE-attested source briefs into a Slack Connect channel (`#war-desk`) shared across newsroom organizations.

> *"Most newsroom intake forms ask you to trust the newsroom. This one doesn't ask you to trust anyone. The hardware proves it."*

---

## What this is

```
near-bounty/
├── A2A agent endpoint    — any A2A client can send a source brief to this agent
├── Slack Connect poster  — posts the TEE-attested brief to #war-desk
└── Manual intake page    — web UI for testing the intake flow manually
```

The core flow:

```
Source (Strait of Hormuz) → speaks to AI journalist
        │
        ▼
NEAR AI Cloud (Intel TDX + NVIDIA H200 Confidential Compute)
  TLS terminates inside the enclave
  plaintext never exists outside the chip
        │
        ▼
TEE attestation badge per response
  intel_tdx: PASS · nvidia_nras: PASS · response_sig: PASS
        │
        ▼
Slack Connect → #war-desk channel
  shared across orgs — attestation travels with the brief
  partner newsrooms verify independently, no one trusts anyone
```

## Endpoints

| Route | What it does |
|-------|-------------|
| `/api/a2a` | A2A JSON-RPC `message/send` — source brief in, attested brief posted to Slack |
| `/.well-known/agent.json` | A2A agent card (`gdpr` + `near-tee-attestation` extensions) |
| `/api/intake` | REST intake for manual testing |
| `/api/dsar` | Source data deletion request |
| `/api/health` | Model + deployment status |
| `/` | Manual intake UI (testing only) |

## Attestation

Every brief comes with:

```
TEE: NEAR AI Cloud — Intel TDX + NVIDIA H200 CC
intel_tdx:       PASS
nvidia_nras:     PASS
report_data:     bound · nonce + signing key verified
response_sig:    PASS
signing_address: 0x…
```

Fail-closed: if any check fails, the brief is suppressed and not posted to the channel.

## Why TEE matters here

| Risk | Standard cloud LLM | NEAR AI Cloud TEE |
|------|-------------------|-------------------|
| Provider reads source's words | ✅ Yes (30-day retention) | ❌ TLS ends inside the chip |
| Subpoena produces readable logs | ✅ Yes | ❌ Vendor has nothing to hand over |
| Source must trust vendor's claims | ✅ Trust-me | ❌ Cryptographic proof per response |

## Setup

```bash
# env vars
NEAR_AI_API_KEY=...      # from cloud.near.ai
SLACK_BOT_TOKEN=...      # for posting to #war-desk
SLACK_CHANNEL_ID=...     # #war-desk channel ID

# local dev (manual testing only)
cd near-bounty
npm install
NEAR_AI_API_KEY=... npm run dev

# deploy as Vercel function (set Root Directory: near-bounty/)
vercel deploy
```

## Integration with slack/

The A2A agent card at `/.well-known/agent.json` can be invited into the `slack/` workspace. Once invited, it appears in the Agents sidebar and can be assigned to the `#war-desk` Slack Connect channel like any other agent.
