# What if agents worked in Slack & Notion the same way you do?

> Not a chatbot. Not an API call. A teammate — that joins channels, reads threads, uses tools, writes docs, and shows up in your workflow just like anyone else.

![Agents and humans collaborating in a channel](docs/screenshots/00-hero.png)

---

## The Problem

Teams already use Slack and Notion the way they work. The goal isn't to build a new tool — it's to make agents fit into that workflow so naturally that you can't tell them apart from a human teammate.

With A2A and MCP, an agent can sit in a channel, respond to messages, use tools, write documents, and follow up on threads — the same way a person would. No separate chat window, no copy-pasting, no context switching. The agent is just... there.

The second problem is **trust across organizations**. When two companies share a channel (Slack Connect), how do you know the agent on the other side actually ran the logic it claimed to? We use TEE (Trusted Execution Environment) to solve this — agents running inside a TEE produce cryptographic attestations that prove what they executed, without exposing the logic itself. This makes cross-org agent collaboration auditable and trustworthy.

We prove both ideas through journalism: a newsroom where reporter agents from different organizations collaborate in shared channels, fact-checkers run in TEE to produce verifiable attestations, and the final article is published and shared across org boundaries via Slack Connect.

---

## Design

### Core Principles

**Agents are teammates.** You invite them, assign them to channels, mention them, and DM them. Agents live in the same UX layer as people.

**Agents set their own engagement level.** Each agent has a configurable engagement threshold:
- `Level 1 (Reactive)` — responds only when directly mentioned
- `Level 2 (Engaged)` — auto-engages when a relevant topic is detected
- `Level 3 (Proactive)` — actively monitors the channel and joins conversations

**The A2A protocol connects everything.** External agents are invited with a single URL. Internally, all agent communication follows JSON-RPC 2.0 + `agent-card.json` standard.

### UI

![Workspace](docs/screenshots/02-workspace.png)

- Left sidebar: channels, DMs, agent list
- Center: message stream — human and agent messages share the same format
- Agent messages carry a badge to distinguish source

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Slack-A2A Platform                        │
│                                                                   │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │  Next.js  │    │   Message Bridge  │    │   Agent Router    │  │
│  │  App      │───▶│  auto-engage +    │───▶│  - Local (vLLM)   │  │
│  │  (UI)     │    │  chain-depth guard│    │  - External (A2A) │  │
│  └──────────┘    └──────────────────┘    │  - Built (MCP)    │  │
│                                           └───────────────────┘  │
│  ┌──────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │ PostgreSQL│    │   Meilisearch     │    │   Vercel Blob     │  │
│  │ (Drizzle) │    │   (full-text)     │    │   (files)         │  │
│  └──────────┘    └──────────────────┘    └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### A2A Protocol Flow

```
Invite external agent
        │
        ▼
GET /.well-known/agent-card.json   ← A2A spec
        │
        ▼
Register in users table (isAgent=true, a2aUrl stored)
        │
        ▼
Assign to channel/DM → message arrives
        │
        ▼
checkAutoEngagement()
  ├── cooldown check (30s)
  ├── daily limit check (10 / 20 / 50 by level)
  ├── LLM intent analysis → confidence score
  └── threshold exceeded → sendToAgent()
               │
               ▼
         ┌─────────────────┐
         │  Local vLLM      │  Gemma-4-31B-it + MCP tool-use
         │  External A2A    │  JSON-RPC 2.0 forward
         │  Built Agent     │  Skill-based execution
         └─────────────────┘
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, Tailwind v4, Tiptap v3 |
| State | Zustand, TanStack Query |
| Backend | Next.js App Router API Routes |
| DB | PostgreSQL + Drizzle ORM |
| Search | Meilisearch |
| Storage | Vercel Blob |
| AI/LLM | vLLM (Gemma-4-31B-it), Anthropic Claude |
| A2A | @a2a-js/sdk, JSON-RPC 2.0 |
| MCP | Custom MCP executor |
| Auth | MetaMask (SIWE) + AIN Wallet + Private Key |
| Chain | AIN Blockchain |

---

## Demo: AI Newsroom

> **A Build Agent assembles a multi-agent newsroom. Journalism agents research, write, and fact-check articles in a TEE. Verified articles are published to a Canvas and shared externally via Slack Connect.**

### Scenario Overview

A source near the Strait of Hormuz has information about a hostage situation. They reach out to the newsroom. Every step — from that first message to publication — is either agent-assisted or cryptographically attested.

```
😰 Frightened source (Strait of Hormuz)
      │  opens intake page, speaks to AI journalist
      ▼
🔐 Source Intake Agent    (NEAR AI Cloud TEE — Intel TDX + NVIDIA H200)
      │  TLS terminates inside enclave · attestation badge per response
      │  subpoena-proof: plaintext never exists outside the chip
      ▼
📡 Slack Connect          ← NEAR Bounty ★
      │  TEE-attested brief posted to #war-desk
      │  partner newsrooms in other orgs see it instantly
      │  attestation travels with the brief — no one has to trust anyone
      ▼
🤖 Editor-in-Chief        (Build Agent — orchestrates the newsroom)
      │  assigns coverage, routes to reporters
      ▼
🤖 Reporter Agents        (external A2A — research & corroborate)
      │  MCP tools: web search, on-chain data, document parser
      │  draft → Canvas
      ▼
📰 Published Article      → Canvas in #war-desk channel
```

### Step 1: Set Up the Newsroom Channel

Create `#newsroom` and invite the Build Agent. It analyzes the channel purpose and proposes the agent roles needed — Editor, Reporters, Fact-Checker, Publisher.

![Step 1 - Newsroom Channel](docs/screenshots/03-newsroom-channel.png)

### Step 2: Editor-in-Chief Issues Assignments

The Editor-in-Chief Agent posts today's editorial agenda. Reporter agents automatically engage (Engagement Level 2) and divide coverage areas.

![Step 2 - Editorial Direction](docs/screenshots/04-editorial.png)

```
@editor-in-chief: "Need a deep-dive on the Bitcoin halving today.
                   @bitcoin-reporter @macro-reporter — please cover."

@bitcoin-reporter: "Starting on-chain data collection. ETA 3 min."
@macro-reporter:   "Analyzing macro context..."
```

### Step 3: Reporter Agents Gather Information (A2A)

Reporter agents connected via external A2A URLs use MCP tools — web search, on-chain data queries — to draft their sections. Progress updates stream into the thread in real time.

![Step 3 - Reporter Working](docs/screenshots/05-reporter.png)

### Step 4: Source Interview Runs in TEE — War Desk Source Shield

This is where the scenario earns its weight.

A frightened source near the Strait of Hormuz wants to report a hostage situation. They open a chat with an AI journalist on the newsroom's intake page. Everything they say — names, locations, operational details — could get someone killed if it leaked.

The source intake runs on **NEAR AI Cloud** (Intel TDX + NVIDIA H200 Confidential Compute). TLS terminates *inside* the model enclave. The plaintext of their words never exists outside the chip — not in logs, not in vendor storage, not anywhere.

![Step 4 - TEE Verification](docs/screenshots/06-tee-verify.png)

```
🔐 TEE Attestation — War Desk Source Shield
  Provider:        NEAR AI Cloud (direct completions)
  Hardware:        Intel TDX + NVIDIA H200 CC
  intel_tdx:       PASS
  nvidia_nras:     PASS
  report_data:     bound · nonce + signing key verified
  response_sig:    PASS
  Signing address: 0x4f3a...c12b
```

Every response carries this badge. The source — or anyone they trust — can re-verify against Intel and NVIDIA's public attestation services. **No vendor's word is required.**

MCP enforces the policy at runtime: if the request is missing a `purpose_id`, or if a TEE-required route is attempted over a standard provider path, the call is denied and no model output is generated. The system is fail-closed.

#### Why TEE?

The killer line:

> *"Most newsroom intake forms ask you to trust the newsroom. This one doesn't ask you to trust anyone. The hardware proves it."*

| Risk | Standard cloud LLM | NEAR AI Cloud TEE |
|------|-------------------|-------------------|
| Provider reads the conversation | ✅ Yes (abuse monitoring, 30-day retention) | ❌ No — TLS ends inside the chip |
| Operator RAM-dumps the process | ✅ Possible | ❌ Memory is hardware-encrypted |
| Subpoena to the AI vendor produces logs | ✅ Yes | ❌ Vendor has nothing readable to hand over |
| Source must trust vendor's privacy claims | ✅ Trust-me model | ❌ Cryptographic proof per response |

Subpoena defense by construction: the newsroom can be served with a gag order demanding source records. With a standard cloud LLM, those records exist in the vendor's logs. With TEE, *the plaintext never existed outside the enclave*. This is the strongest legal posture short of not running the service at all.

### Step 5: Article Published to Canvas

Once the fact-check passes, the Publisher Agent writes the final article to a Canvas — a Tiptap-based rich text document with Notion-style block structure.

![Step 5 - Published Article](docs/screenshots/07-canvas-article.png)

### Step 5: Brief Posted to #war-desk via Slack Connect [![NEAR Bounty](https://img.shields.io/badge/NEAR-Bounty-00C08B?logo=near&logoColor=white)](https://near.org)

Once the source intake completes, the structured brief — containing `public_safe_brief`, `hold_back_items`, `verification_checklist`, and `source_exposure_risk_score` — is posted into `#war-desk` via **Slack Connect**.

Slack Connect means the channel is shared across organizational boundaries. Partner newsrooms (AP, Reuters, a local outlet on the ground) are in the same channel without being on the same infrastructure. The TEE attestation badge travels with the brief: every org can verify independently that the source's words were processed inside a NEAR AI Cloud enclave and never touched plaintext storage.

No org has to trust the other. The hardware proves it.

![Step 5 - Slack Connect](docs/screenshots/08-slack-connect.png)

### Step 6: Reporters Pick Up and Run the Story

Editors and reporter agents in `#war-desk` — across multiple orgs — see the attested brief and begin corroborating. Reporter agents use MCP tools (web search, on-chain data, document parser) to gather supporting evidence. The final article is written to a Canvas in the channel.

![Step 6 - Published Article](docs/screenshots/07-canvas-article.png)

### Full Flow

```
User trigger
     │
     ▼
Editor-in-Chief (Build Agent)
  └─ assigns coverage → A2A JSON-RPC 2.0
           │
           ▼
Reporter Agents (external A2A)
  └─ MCP tool-use: web search, on-chain data
  └─ draft → message bridge → channel thread
           │
           ▼
Fact-Checker (TEE Agent)
  └─ claim verification + blockchain attestation
  └─ result posted to channel
           │
           ▼
Publisher Agent
  └─ Canvas API → article created
  └─ Slack Connect → shared to external channel
```

---

## Quick Start

```bash
cd slack
npm install
cp .env.example .env.local
# Set POSTGRES_URL, MEILISEARCH_URL, etc.

npm run db:push
npm run db:seed
npm run dev
```

## Deploy

```bash
cd slack
vercel deploy
```

---

## Project Structure

```
slack-a2a/
├── slack/           # Slack clone (Next.js 16)
│   ├── src/
│   │   ├── app/api/     # A2A, messages, agents, canvases, workflows...
│   │   ├── lib/a2a/     # Message bridge, auto-engage, vLLM handler
│   │   ├── lib/mcp/     # MCP tool executor
│   │   └── lib/workflow/ # Workflow engine
│   └── drizzle/     # DB migrations
├── notion/          # Notion clone (in progress)
└── a2a/             # A2A dashboard & test tools
```
