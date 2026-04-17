import cardTemplate from "@/agent-card.example.json";

export function getDeploymentBaseUrl(): string {
  if (process.env.AGENT_PUBLIC_URL) return process.env.AGENT_PUBLIC_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const PLACEHOLDER_BASE = "https://near-bounty.example";

export function buildAgentCard() {
  const base = getDeploymentBaseUrl();
  const card = JSON.parse(
    JSON.stringify(cardTemplate).replaceAll(PLACEHOLDER_BASE, base),
  ) as typeof cardTemplate & {
    url: string;
    documentationUrl?: string;
  };

  card.url = `${base}/api/a2a`;
  card.documentationUrl = `${base}/`;

  for (const ext of card.capabilities.extensions ?? []) {
    if (ext.uri?.includes("/gdpr/")) {
      const params = ext.params as Record<string, unknown>;
      params.dsar_endpoint = `${base}/api/dsar`;
    }
  }
  return card;
}
