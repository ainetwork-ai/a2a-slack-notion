import type { PolicyContext } from "@/lib/mcp/policy";

export type ProviderKind = "standard" | "near_ai_tee";

export interface ProviderRequest {
  systemPrompt: string;
  userContent: string;
  policy: PolicyContext;
}

export interface AttestationEvidence {
  signingAddress: string;
  intelTdxVerified: boolean;
  nvidiaNrasVerdict: "PASS" | "FAIL" | "UNKNOWN";
  reportDataBound: boolean;
  responseSignatureVerified: boolean;
  evidenceId: string;
  chatId?: string;
}

export interface ProviderResult {
  kind: ProviderKind;
  content: string;
  attestation?: AttestationEvidence;
  attestationVerified: boolean;
}

export interface AgentProvider {
  kind: ProviderKind;
  infer(req: ProviderRequest): Promise<ProviderResult>;
}
