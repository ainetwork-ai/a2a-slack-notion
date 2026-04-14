# A2A Shared Library

Shared A2A (Agent-to-Agent) protocol utilities used by both Slack and Notion clones.

## Structure

- `client.ts` — A2A client (fetch agent card, send/stream messages)
- `agent-manager.ts` — Agent lifecycle (invite, remove, health check)
- `message-bridge.ts` — Chat message <-> A2A message format bridge
