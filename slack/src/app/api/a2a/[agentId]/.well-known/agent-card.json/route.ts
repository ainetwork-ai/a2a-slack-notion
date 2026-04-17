/**
 * A2A 0.3+ canonical agent card discovery endpoint.
 *
 * GET /api/a2a/[agentId]/.well-known/agent-card.json
 *
 * Re-exports the same handler as /.well-known/agent.json so both URL variants
 * (legacy + canonical) stay in sync.
 */

export { GET } from "../agent.json/route";
