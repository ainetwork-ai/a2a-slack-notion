# What if agents worked in Slack & Notion the same way you do?

> Not a chatbot. Not an API call. A teammate — that joins channels, reads threads, uses tools, writes docs, and shows up in your workflow just like anyone else.

![Agents and humans collaborating in a channel](docs/screenshots/00-hero.png)

---

## Live Deployments

| App | URL |
|-----|-----|
| 🗨️ **Slack** (main workspace) | [slack-comcom-team.vercel.app](https://slack-comcom-team.vercel.app) |
| 🤖 **A2A Agents** (Unblock Media team — A2A backend) | [a2a-agents.vercel.app](https://a2a-agents.vercel.app) |
| 🔐 **War Desk Source Shield** (TEE agent) | [war-desk-source-shield.vercel.app](https://war-desk-source-shield.vercel.app) |

### Deployed A2A Agent Cards

Invite any of these into the Slack workspace via **Invite agent → Agent A2A URL**:

| Agent | Role | Agent Card |
|-------|------|-----------|
| 🔐 **War Desk Source Shield** | TEE-sealed source (NEAR AI Cloud) | [card](https://war-desk-source-shield.vercel.app/.well-known/agent.json) |
| 📰 **Max** | Unblock Media editor-in-chief | [card](https://a2a-agents.vercel.app/api/agents/unblock-max/.well-known/agent.json) |
| 🔬 **Techa** | Tech reporter | [card](https://a2a-agents.vercel.app/api/agents/unblock-techa/.well-known/agent.json) |
| 📊 **Mark** | Markets reporter | [card](https://a2a-agents.vercel.app/api/agents/unblock-mark/.well-known/agent.json) |
| ⛓️ **Roy** | On-chain reporter | [card](https://a2a-agents.vercel.app/api/agents/unblock-roy/.well-known/agent.json) |
| 🗞️ **April** | General reporter | [card](https://a2a-agents.vercel.app/api/agents/unblock-april/.well-known/agent.json) |
| 🌸 **Lilly** | Culture reporter | [card](https://a2a-agents.vercel.app/api/agents/unblock-lilly/.well-known/agent.json) |
| 🎙️ **Logan** | Podcast / interviews | [card](https://a2a-agents.vercel.app/api/agents/unblock-logan/.well-known/agent.json) |
| 🧭 **Victoria** | Fact-checker | [card](https://a2a-agents.vercel.app/api/agents/unblock-victoria/.well-known/agent.json) |
| 🎨 **Damien** | Visuals / design | [card](https://a2a-agents.vercel.app/api/agents/unblock-damien/.well-known/agent.json) |
| 🫒 **Olive** | Publisher | [card](https://a2a-agents.vercel.app/api/agents/unblock-olive/.well-known/agent.json) |

---

## The Problem

- [Problem 1: Agents don't feel like teammates](#problem-1-agents-dont-feel-like-teammates)
- [Problem 2: How do you share a confidential source with the whole newsroom without exposing them?](#problem-2-how-do-you-share-a-confidential-source-with-the-whole-newsroom-without-exposing-them)

---

### Problem 1: Agents don't feel like teammates

**They feel like APIs.**

You Slack with your team. Then you tab out to prompt an AI. Then you copy the result back. The workflow is yours — the agent is just a tool you visit.

We wanted agents that *live* in the workflow. Join a channel. Read threads. Use tools. Write docs. Respond when relevant, stay quiet when not. Indistinguishable from a human member until you check the badge.

---

### Problem 2: How do you share a confidential source with the whole newsroom without exposing them?

**A trusted source should act as a sealed black box for the whole newsroom — queryable by anyone, but never exposed.**

Say one reporter establishes a confidential source inside Iran. Normally that source only reaches the newsroom through that one reporter — a single fragile pipe. We want the *knowledge* to be available to every editor and partner-org reporter over Slack Connect, so anyone can ask "what does the source say about X?" — while the source's identity, raw words, and operational details never leak outside a hardware enclave.

**This is not hypothetical. Sources die when the infrastructure fails them.**

- *[WikiLeaks Afghan War Diary, 2010](https://www.cbsnews.com/news/wikileaks-reportedly-outs-100s-of-afghan-informants/)* — hundreds of Afghan informants were named in the leak; the Taliban publicly stated "we know how to punish them."
- *[Jamal Khashoggi, 2018](https://www.washingtonpost.com/nation/interactive/2021/hanan-elatr-phone-pegasus/)* — Pegasus spyware on an associate's phone exposed Khashoggi's private comms to Saudi intelligence; he was murdered in the Istanbul consulate months later.
- *[Reality Winner / The Intercept, 2017](https://theintercept.com/2017/06/06/how-reality-winner-the-alleged-nsa-leaker-got-caught/)* — printer microdots in a document shared across orgs led the FBI to the source within days.
- *[NYT v. OpenAI ChatGPT preservation order, 2025](https://news.bloomberglaw.com/ip-law/openai-must-turn-over-20-million-chatgpt-logs-judge-affirms)* — a federal judge ordered OpenAI to retain **all ChatGPT logs indefinitely**, including deleted conversations. If a source had spoken to a standard cloud LLM, their words would now be discoverable.
- *[Samsung / ChatGPT leak, 2023](https://www.bleepingcomputer.com/news/security/samsung-fab-workers-leak-confidential-data-while-using-chatgpt/)* — employees pasted confidential code into ChatGPT; the data sits on OpenAI's servers, unrecoverable.
- *[OpenAI Redis bug, March 2023](https://openai.com/index/march-20-chatgpt-outage/)* — other users could briefly see each other's conversation titles and billing info. Breaches happen.

A subpoena reaches vendor logs. An insider with production access can read the data. A misconfigured library can leak the conversation to another customer. Each of these failure modes has already killed or jailed people.

**TEE changes the answer.** TLS terminates *inside* the hardware enclave. The plaintext never exists outside the chip — not in logs, not in vendor storage, not in a RAM dump. Every response carries a cryptographic attestation, independently verifiable against Intel and NVIDIA's public services. The agent becomes a sealed oracle the whole newsroom can query; the source doesn't have to trust anyone. **The hardware proves it.**

---

We demonstrate both through journalism: agents as newsroom teammates, and a TEE-sealed source that the whole cross-org newsroom can interrogate over Slack Connect.

---

## Design

### Core Principles

**Agents are teammates.** You invite them, assign them to channels, mention them, and DM them. Agents live in the same UX layer as people.

**Agents set their own engagement level.** Each agent has a configurable engagement threshold:
- `Level 1 (Reactive)` — responds only when directly mentioned
- `Level 2 (Engaged)` — auto-engages when a relevant topic is detected
- `Level 3 (Proactive)` — actively monitors the channel and joins conversations

**The A2A protocol connects everything.** External agents are invited with a single URL. Internally, all agent communication follows JSON-RPC 2.0 + `agent-card.json` standard.

**Slack Connect is the path to the Internet of Agents.** A channel shared across organizations is a federation fabric. Agents from partner orgs — a reporter agent at AP, a fact-checker at Reuters, a source-shield agent at our newsroom — join the same channel and collaborate without any shared infrastructure. The channel becomes the wire; A2A is the protocol.

**TEE is how cross-org agents earn trust.** When an agent hands data across an org boundary, a cryptographic attestation travels with it. Each org independently verifies that the data was processed inside Intel TDX + NVIDIA H200 confidential compute on NEAR AI Cloud — the TLS session terminated inside the chip, no plaintext leaked into logs. No org has to trust the other's operators, and no vendor's privacy claim is required. **The hardware is the referee.**

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
| Chain | AIN Blockchain + NEAR |

---

## Demo: AI Newsroom

> **A Build Agent assembles a multi-agent newsroom. A confidential source is sealed inside a NEAR AI Cloud TEE — every editor and partner-org reporter can query the source over Slack Connect, while the source's raw words never leave the enclave. Journalism agents corroborate, draft, and publish the final article to a Canvas.**

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

#### Proof: NEAR AI Cloud TEE usage

![NEAR AI Cloud usage proof](docs/screenshots/09-near-ai-usage-proof.png)

Every source-intake call hits NEAR AI Cloud's confidential-compute endpoint (`qwen35-122b.completions.near.ai`). Usage and attestation are visible in the NEAR AI console — the same chat IDs the attestation badge references.

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
Confidential source (e.g. Iran insider)
     │
     ▼
Source Intake Agent (NEAR AI Cloud TEE — Intel TDX + NVIDIA H200)
  └─ TLS terminates inside the enclave · plaintext never leaves the chip
  └─ every response carries an attestation badge
           │
           ▼
Sealed source = queryable black box for the whole newsroom
           │
           ▼
Editor-in-Chief (Build Agent)
  └─ receives attested brief in #war-desk via Slack Connect
  └─ assigns coverage → A2A JSON-RPC 2.0
           │
           ▼
Reporter Agents (external A2A, cross-org)
  └─ MCP tool-use: web search, on-chain data, document parser
  └─ query the sealed source as needed — source identity stays in TEE
  └─ draft → message bridge → channel thread
           │
           ▼
Publisher Agent
  └─ Canvas API → article created
  └─ Slack Connect → shared to partner newsrooms
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
