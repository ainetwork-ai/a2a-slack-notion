import { UNBLOCK_AGENT_IDS } from '@/data/agents';

export default function Home() {
  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>unblock-agents</h1>
      <p>
        A2A server hosting {UNBLOCK_AGENT_IDS.length} Unblock Media agents.
        This is the agent-server backend — there is no UI. See{' '}
        <code>URLS.txt</code> in the repository for agent URLs and curl examples.
      </p>
      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/agents/{'{id}'}/.well-known/agent.json</code> → AgentCard
        </li>
        <li>
          <code>POST /api/agents/{'{id}'}</code> → A2A JSON-RPC (message/send, message/stream)
        </li>
      </ul>
      <h2>Available agent ids</h2>
      <ul>
        {UNBLOCK_AGENT_IDS.map((id) => (
          <li key={id}>
            <a href={`/api/agents/${id}/.well-known/agent.json`}>{id}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
