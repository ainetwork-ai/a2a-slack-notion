# unblock-agents

Standalone A2A (Agent-to-Agent) server hosting the 10 Unblock Media agents.
No database, no UI — just 10 agents defined in code, exposed at `/api/agents/{id}`.

## What's inside

- **5 reporters** — Max, Techa, Mark, Roy, April
- **3 managers** — Lilly, Logan, Victoria
- **1 editor-in-chief** — Damien
- **1 designer** — Olive

Each agent has role-appropriate skills (report/writing/revision for reporters,
guide/feedback for managers, assignment/confirm for the chief, drawing for the
designer). Sending a message with `metadata.skillId = "<skill>"` activates that
skill's task prompt; omitting it gives plain persona chat.

## Run locally

```bash
npm install
cp .env.example .env.local
# fill in LLM_API_URL + LLM_MODEL (or Azure OpenAI values)
npm run dev
```

Then visit, for example:
<http://localhost:3000/api/agents/unblock-max/.well-known/agent.json>

## Deploy (any origin works)

The handler reads `x-forwarded-proto` / `x-forwarded-host` so the AgentCard's
`url` field is populated with the real public origin (not localhost) when
running behind Vercel / ngrok / any reverse proxy.

```bash
# Example: Vercel
vercel deploy
```

Once deployed, see `URLS.txt` for the full list of 10 agent URLs — just
replace `{BASE}` with your deployment origin.

## Try a skill

```bash
curl -X POST http://localhost:3000/api/agents/unblock-max \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "msg-1",
        "role": "user",
        "parts": [{ "kind": "text", "text": "비트코인 관점에서 최근 시장 분석해줘" }],
        "metadata": {
          "skillId": "report",
          "variables": {
            "TODAY_DATE": "2025-11-17",
            "BASIC_ARTICLE_SOURCE": "비트코인 현물 ETF 승인 후 ... (실제 원문)",
            "CHIEF_COMMENT": "이번 주 핵심 건으로 다뤄줘"
          }
        }
      }
    }
  }'
```

Leave `metadata.skillId` out to chat with the agent's persona directly.
Leave `metadata.variables` out if a skill doesn't need templating — any
`^VAR^` not substituted is replaced with `(제공되지 않음)` so the LLM
doesn't echo literal placeholders back to the caller.

### Variables each skill expects

| Skill        | Role              | Variables (all optional but recommended)                        |
| ------------ | ----------------- | --------------------------------------------------------------- |
| `assignment` | editor-in-chief   | `TODAY_DATE`, `BASIC_ARTICLE_SOURCE`                            |
| `report`     | reporter          | `TODAY_DATE`, `BASIC_ARTICLE_SOURCE`, `CHIEF_COMMENT`           |
| `guide`      | manager           | `REPORTER`, `MARKET_RESEARCH`                                   |
| `writing`    | reporter          | `MARKET_RESEARCH`, `ARTICLE_GUIDE`                              |
| `feedback`   | manager           | `REPORTER`, `TODAY_DATE`, `BASIC_ARTICLE_SOURCE`, `ARTICLE_DRAFT` |
| `revision`   | reporter          | `ARTICLE_DRAFT`, `MANAGER_FEEDBACK`                             |
| `confirm`    | editor-in-chief   | `REPORTER`, `TODAY_DATE`, `CORRECTED_ARTICLE`                   |
| `drawing`    | designer          | (none — produces a free-form response)                          |

Variable keys are case-insensitive on the server side; `TODAY_DATE` and
`today_date` both match `^TODAY_DATE^`.

`TODAY_DATE` is **auto-injected from the server's clock in Asia/Seoul**
(`YYYY-MM-DD`) when a skill is active and the caller didn't supply one.
An authoritative date note is also prepended to the system prompt
telling the LLM not to "correct" the date to its training cutoff, so
out-of-cutoff dates (e.g. 2026) are preserved rather than silently
rewritten to 2024. Pass `TODAY_DATE` explicitly only if you want to
override the server clock (backdating for archival runs, etc.).
