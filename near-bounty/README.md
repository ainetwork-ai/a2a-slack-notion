# War Desk Source Shield — NEAR Bounty

A trauma-informed source intake for newsroom reporting, running on
**NEAR AI Cloud** (Intel TDX + NVIDIA H200 confidential compute).
Standalone Vercel-deployable app + A2A-compliant agent card.

---

## What you get when you deploy this

| URL | What it serves |
|---|---|
| `/` | One-pager intake. A source in distress can speak with an empathetic AI journalist. Calm, trust-first UI; trauma-informed system prompt; per-message attestation badge. |
| `/.well-known/agent.json` | Live A2A agent card with `gdpr` and `near-tee-attestation` extensions. Deployment URL is substituted at request time. |
| `/.well-known/agent-card.json` | Same card under the newer A2A path. |
| `/api/a2a` | A2A JSON-RPC `message/send` endpoint (any A2A client can talk to this agent). |
| `/api/intake` | Backing API for the `/` chat (POST history → reply + attestation badge). |
| `/api/attestation/report` (proxied implicit) | Attestation is fetched from NEAR AI Cloud per request. |
| `/api/dsar` | Minimal DSAR endpoint declared in the agent card. |
| `/api/health` | Deployment + model status. |

---

## Deploy

1. Vercel → New Project → import this repo, set **Root Directory** to
   `near-bounty/`.
2. Add env vars:
   - `NEAR_AI_API_KEY` — from https://cloud.near.ai/signin (required)
   - `AGENT_PUBLIC_URL` — optional, e.g. `https://war-desk.example.com`
     (otherwise `VERCEL_PROJECT_PRODUCTION_URL` is used)
   - Optional overrides: `NEAR_AI_MODEL_SLUG` (default `qwen35-122b`),
     `NEAR_AI_MODEL_ID` (default `Qwen/Qwen3.5-122B-A10B`)
3. Deploy. The agent card at `/.well-known/agent.json` will reflect the
   real deployment URL automatically.

Local dev:
```
cd near-bounty
npm install
NEAR_AI_API_KEY=... npm run dev
open http://localhost:3000
```

---

## What is being trusted, and how

- **Inference**: NEAR AI Cloud, direct-completions mode
  (`https://qwen35-122b.completions.near.ai/v1`).
- **TLS**: terminates *inside* the model TEE — prompts are never plaintext
  outside the enclave.
- **Attestation**: per response, the page fetches
  `/v1/attestation/report` (Intel TDX quote + NVIDIA NRAS payload) and
  `/v1/signature/{chat_id}` (response signature). The badge in the UI
  flips green only when all four checks pass: Intel TDX, NVIDIA NRAS=PASS,
  report-data binds nonce + signing address, response signature verified.
  This is a fail-closed surface gate. Production-grade verification (with
  `dcap-qvl-node` + NRAS HTTP call) is the next implementation step;
  current code reads the structured proof and surfaces it.
- **No persistence by design**: this app does not store conversation
  content. The only optional storage is structured brief output the source
  *chooses* to keep (rendered client-side; not persisted server-side
  unless extended).

---

## Files (in reading order)

1. **`README.md`** — you are here.
2. **`compliance-extension-status.md`** — *Is there an official A2A
   compliance extension we must use? Are our custom extensions legally
   allowed?* (Answer: no official one exists; community extensions like
   ours are sanctioned by the spec.)
3. **`plan.md`** — full architecture, NEAR AI Cloud integration, A2A
   extensions, MVP scope, retention table.
4. **`agent-card.example.json`** — the source card. URL placeholders are
   rewritten to the live deployment URL by `lib/agent-card.ts`.
5. **`integration-points.md`** — file-by-file map of how this same
   integration would slot into the parent `slack/` app.
6. **`compliance-matrix.md`** — GDPR ↔ Korea PIPA control mapping.
7. **`demo-script.md`** — 3-minute recording plan with three scenes
   (trusted run / policy deny / **real** attestation failure).
8. **`score-85-checklist.md`** — 2-day execution checklist with
   self-estimated scoring (caveat: not an official rubric).

---

## App layout

```
near-bounty/
├── app/
│   ├── page.tsx              # trauma-informed intake UI (client)
│   ├── layout.tsx · globals.css
│   ├── .well-known/
│   │   ├── agent.json/route.ts
│   │   └── agent-card.json/route.ts
│   └── api/
│       ├── intake/route.ts   # POST → NEAR AI Cloud + attestation
│       ├── a2a/route.ts      # JSON-RPC message/send
│       ├── dsar/route.ts
│       └── health/route.ts
├── lib/
│   ├── agent-card.ts         # rewrites placeholder URL → deployment URL
│   ├── interview-prompt.ts   # trauma-informed journalist persona
│   └── near-ai.ts            # NEAR AI Cloud client + attestation fetch
├── agent-card.example.json   # canonical card (extension params live here)
├── package.json · tsconfig.json · next.config.mjs · vercel.json
└── (planning docs above)
```

---

## A2A compliance posture

- Extensions live under our deployment URL (community-extension pattern,
  per the A2A spec). We deliberately **do not** use the reserved
  `https://a2a-protocol.org/extensions/` prefix.
- Both extensions are declared `required: true` so any client speaking to
  this agent is contractually bound by the policy and attestation
  semantics.
- Full reasoning + spec citations: see `compliance-extension-status.md`.

---

## Reference docs (NEAR AI Cloud)

- Private inference: https://docs.near.ai/cloud/private-inference/
- Verification: https://docs.near.ai/cloud/verification/
- Verifier (Python + TS): https://github.com/nearai/nearai-cloud-verifier
- Worked example (Node 18+): https://github.com/near-examples/nearai-cloud-verification-example
- Direct completions endpoint list: https://completions.near.ai/endpoints
