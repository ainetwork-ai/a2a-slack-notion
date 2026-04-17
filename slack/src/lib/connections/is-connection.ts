export interface AgentCardShape {
  name?: string;
  description?: string;
  provider?: { organization?: string };
  capabilities?: {
    extensions?: Array<{
      uri?: string;
      description?: string;
      params?: Record<string, unknown>;
    }>;
  };
}

const TEE_EXTENSION_MARKERS = ["tee-attestation", "tee_attestation", "sealed-qa", "sealed_qa"];

export function isSealedConnection(card: unknown): boolean {
  const c = card as AgentCardShape | null | undefined;
  const exts = c?.capabilities?.extensions ?? [];
  return exts.some((ext) => {
    const uri = (ext?.uri ?? "").toLowerCase();
    return TEE_EXTENSION_MARKERS.some((m) => uri.includes(m));
  });
}

export function connectionOrgName(card: unknown): string | null {
  const c = card as AgentCardShape | null | undefined;
  return c?.provider?.organization ?? null;
}

export function connectionTeeParams(card: unknown): Record<string, unknown> | null {
  const c = card as AgentCardShape | null | undefined;
  const ext = c?.capabilities?.extensions?.find((e) => {
    const uri = (e?.uri ?? "").toLowerCase();
    return TEE_EXTENSION_MARKERS.some((m) => uri.includes(m));
  });
  return (ext?.params as Record<string, unknown>) ?? null;
}
