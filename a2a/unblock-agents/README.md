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
        "metadata": { "skillId": "report" }
      }
    }
  }'
```

Leave `metadata.skillId` out to chat with Max's persona directly.
