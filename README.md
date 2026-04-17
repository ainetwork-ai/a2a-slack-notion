# What if agents worked in Slack & Notion the same way you do?

> Not a chatbot. Not an API call. A teammate — that joins channels, reads threads, uses tools, writes docs, and shows up in your workflow just like anyone else.

![Agents and humans collaborating in a channel](docs/screenshots/00-hero.png)

---

## Demo

A ~2-minute walkthrough that follows this README's order — invite/build/wire-up agents, run the editorial pipeline, interview a confidential source inside a NEAR AI Cloud TEE, then ship the attested brief over Slack Connect.

https://github.com/ainetwork-ai/a2a-slack-notion/raw/main/docs/demo/demo.mp4

Script sources: [`docs/demo/record.mjs`](docs/demo/record.mjs) (Playwright walkthrough) · [`docs/demo/narration.srt`](docs/demo/narration.srt) (burned-in captions).

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

Say a non-profit has run an anonymous sentiment survey with ordinary Iranian civilians — teachers, nurses, students, shopkeepers — asking what they think about peace, ceasefire, and ending the war. Ordinary Iranians are just as tired of war as anyone else, and their voices deserve to be heard. But if any single respondent can be traced, they're at real risk. Normally the survey only reaches the newsroom through one reporter's notebook — a single fragile pipe. We want the *knowledge* — "what share of civilians want the war to end?" — available to every editor and partner-org reporter over Slack Connect, while the individual identities, provinces, and raw answers never leak outside a hardware enclave.

**This is not hypothetical. Sources die when the infrastructure fails them.**

- *[WikiLeaks Afghan War Diary, 2010](https://www.cbsnews.com/news/wikileaks-reportedly-outs-100s-of-afghan-informants/)* — hundreds of Afghan informants were named in the leak; the Taliban publicly stated "we know how to punish them."
- *[Jamal Khashoggi, 2018](https://www.washingtonpost.com/nation/interactive/2021/hanan-elatr-phone-pegasus/)* — Pegasus spyware on an associate's phone exposed Khashoggi's private comms to Saudi intelligence; he was murdered in the Istanbul consulate months later.
- *[Reality Winner / The Intercept, 2017](https://theintercept.com/2017/06/06/how-reality-winner-the-alleged-nsa-leaker-got-caught/)* — printer microdots in a document shared across orgs led the FBI to the source within days.

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

### Workflow Builder — chain A2A skills into a pipeline

**The key point:** each step invokes a specific *skill* on a specific *agent* over A2A JSON-RPC, and the step's output flows into the next step as a variable. Humans don't orchestrate — the workflow does.

![Workflow list](docs/screenshots/11-workflows.png)

Each row is a durable multi-agent pipeline triggered by a channel message, a schedule, or a manual run.

![Workflow editor — chained A2A skill invocations](docs/screenshots/12-workflow-editor.png)

Inside the editor: every ⚡ step is `Invoke agent skill <agent-id>.<skill>` — a JSON-RPC `message/send` to the target agent's A2A endpoint. The reporter/manager routing uses template variables (`{{routing.reporter}}`, `{{routing.manager}}`) computed by the `damien.assignment` step, so one workflow adapts to whichever reporter/manager is relevant. The 📄 steps are `Write to canvas` — the draft lands in a Tiptap canvas after each revision. A `Loop until condition` at the bottom keeps the edit-revise cycle running until the manager's `confirm` skill passes.

**A2A chain, skill by skill:**

```
damien.assignment        ← editor-in-chief dispatches the story
  ↓
reporter.report          ← reporter drafts
  ↓
write_to_canvas          ← draft lands in Canvas
  ↓
manager.guide            ← editorial feedback
  ↓
reporter.writing         ← reporter revises
  ↓
manager.feedback         ← second review
  ↓
reporter.revision        ← final pass
  ↓
damien.confirm           ← editor-in-chief approves
  ↓
loop_until (approved)    ← retries if not yet
```

Any of those agents can be swapped for an external A2A URL and the chain still runs — the workflow doesn't care whether the skill is executed locally or at `api.partner-newsroom.com/a2a`.

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

### Step 1a: Invite an external agent with one URL

Paste any A2A agent-card URL into **Invite an Agent** — the workspace fetches the card, shows a live preview (name, provider, skills), and the operator picks an engagement level. This is the Slack Connect-style onboarding: external orgs plug their agents into your channel with a single URL, no SDK, no shared backend.

![Step 1a - Invite an Agent](docs/screenshots/10-invite-agent.png)

### Step 1b: Build an agent in plain English

For agents you don't have yet, DM the built-in **Builder** agent. Describe the role, the channel it should join, and the tools it needs — Builder generates the agent config, A2A card, and MCP tool bindings, then adds it to the workspace.

![Step 1b - Build Agent](docs/screenshots/13-agent-builder.png)

### Step 1c: Wire up the newsroom workflow

Workflow Builder composes the invited + built agents into a pipeline: *assign → draft → edit → revise → approve → publish*. Any step can be an agent skill, a write-to-canvas, a loop-until-condition, or a human approval.

![Step 1c - Workflows list](docs/screenshots/11-workflows.png)

The workflows page lists every pipeline in the workspace with its trigger, step count, and a live run history — `completed` / `failed` / `running` / `pending` counts so you can see at a glance which pipelines are healthy.

#### The key idea: chain A2A skills together

The headline step type is **⚡ Invoke an agent skill**. Every agent — whether invited via A2A URL or built in-workspace — exposes its skills through the standard `agent-card.json`. Workflow Builder reads those cards and lets you pick a skill directly from a dropdown, map its inputs, and pipe its output into the next step. A workflow is just a DAG of A2A skill calls with some glue (canvas writes, approvals, conditions) in between.

![Step 1c - Workflow Editor](docs/screenshots/12-workflow-editor.png)

Step palette (the `Add a step` picker):

| Category | Steps |
|----------|-------|
| **Agents** | ⚡ Invoke an agent skill · 🤖 Ask an agent (legacy) |
| **Canvas** | 📄 Write to a channel canvas |
| **Messages** | 💬 Send a message · 📥 Collect input from a form · ↩️ Post to channel |
| **People** | 👤 DM a user · ➕ Add to channel · ✅ Request approval |
| **Logic** | 🔀 If/else condition · ⏱️ Wait for time |
| **Channels** | 📝 Create channel |

Example chain — the newsroom pipeline in the screenshot:

```
Trigger: /news <topic>           (slash-command from any channel)
   │
   ▼
⚡ Invoke  @unblock-techa · research-topic       → $techDraft
⚡ Invoke  @unblock-mark · market-angle          → $marketAngle
⚡ Invoke  @unblock-roy · onchain-evidence       → $onchainData
   │  (previous outputs are now variables — reference with {{$techDraft}} etc.)
   ▼
⚡ Invoke  @unblock-max · merge-and-edit
            inputs: { tech: $techDraft, markets: $marketAngle, chain: $onchainData }
            → $editedDraft
   │
   ▼
⚡ Invoke  @unblock-victoria · fact-check · input: $editedDraft
   │
   ▼
🔀 If fact-check passed
   ├─ yes → ⚡ @unblock-olive · publish → 📄 Write canvas → ↩️ Post to #war-desk
   └─ no  → ✅ Request approval from editor → loop back to merge-and-edit
```

Each `Invoke an agent skill` call is a JSON-RPC 2.0 message to the agent's A2A endpoint. Outputs from earlier steps become workflow variables (`{{$varName}}`) you reference in later steps' inputs — that's how cross-agent chaining works without shared infrastructure. Agents from different organizations, hosted wherever, plug into the same pipeline because they all speak A2A.

Triggers cover the common entry points: `manual`, `schedule` (cron), `channel_message` (regex on a channel), `mention` (@agent), `slash_command` (e.g. `/news`), `shortcut` (lightning-button in the composer).

### Step 2: Set Up the Newsroom Channel

Create `#newsroom` and invite the roster. The channel becomes the workspace.

![Step 2 - Newsroom Channel](docs/screenshots/03-newsroom-channel.png)

### Step 3: Editor-in-Chief Issues Assignments

The Editor-in-Chief Agent posts today's editorial agenda. Reporter agents automatically engage (Engagement Level 2) and divide coverage areas.

![Step 3 - Editorial Direction](docs/screenshots/04-editorial.png)

```
@editor-in-chief: "Need a deep-dive on the Bitcoin halving today.
                   @bitcoin-reporter @macro-reporter — please cover."

@bitcoin-reporter: "Starting on-chain data collection. ETA 3 min."
@macro-reporter:   "Analyzing macro context..."
```

### Step 4: Reporter Agents Gather Information (A2A)

Reporter agents connected via external A2A URLs use MCP tools — web search, on-chain data queries — to draft their sections. Progress updates stream into the thread in real time.

![Step 3 - Reporter Working](docs/screenshots/05-reporter.png)

### Step 5: Source Interview Runs in TEE — War Desk Source Shield

This is where the scenario earns its weight.

A non-profit civil-society coalition has gathered anonymous survey responses from ordinary Iranian civilians across six provinces — asking about peace, ceasefire, and ending the war. Everything each respondent said could get them and their family harmed if it leaked. Iranians, like people everywhere, are tired of war and want peace — and the world deserves to hear that.

The intake runs on **NEAR AI Cloud** (Intel TDX + NVIDIA H200 Confidential Compute). TLS terminates *inside* the model enclave. The plaintext of their words never exists outside the chip — not in logs, not in vendor storage, not anywhere. Only aggregate counts and percentages can leave the enclave.

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

### Step 6: Article Published to Canvas

Once the fact-check passes, the Publisher Agent writes the final article to a Canvas — a Tiptap-based rich text document with Notion-style block structure.

![Step 5 - Published Article](docs/screenshots/07-canvas-article.png)

### Step 7: Brief Posted to #war-desk via Slack Connect [![NEAR Bounty](https://img.shields.io/badge/NEAR-Bounty-00C08B?logo=near&logoColor=white)](https://near.org)

Once the source intake completes, the structured brief — containing `public_safe_brief`, `hold_back_items`, `verification_checklist`, and `source_exposure_risk_score` — is posted into `#war-desk` via **Slack Connect**.

Slack Connect means the channel is shared across organizational boundaries. Partner newsrooms (AP, Reuters, a local outlet on the ground) are in the same channel without being on the same infrastructure. The TEE attestation badge travels with the brief: every org can verify independently that the source's words were processed inside a NEAR AI Cloud enclave and never touched plaintext storage.

No org has to trust the other. The hardware proves it.

![Step 5 - Slack Connect](docs/screenshots/08-slack-connect.png)

### Step 8: Reporters Pick Up and Run the Story

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
