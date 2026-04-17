export interface SealedAgentCard {
  name: string;
  description: string;
  url: string;
  provider: { organization: string };
  version: string;
  documentationUrl?: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
    extensions: Array<{
      uri: string;
      description: string;
      required: boolean;
      params: Record<string, unknown>;
    }>;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[]; examples: string[] }>;
  security: { scheme: string; note: string };
}

export function buildSealedWitnessCard(origin: string): SealedAgentCard {
  return {
    name: "Sealed Witness Agent",
    description:
      "A2A-compliant sealed-data Q&A agent: answers policy-permitted questions about sensitive datasets while keeping raw records inside a NEAR AI Cloud TEE. Designed for verifiable journalism, arms-control verification, and audit scenarios.",
    url: `${origin}/api/sealed-witness/a2a`,
    provider: { organization: "Example State Nuclear Authority (demo)" },
    version: "0.4.0",
    documentationUrl: `${origin}/`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      extensions: [
        {
          uri: `${origin}/a2a/extensions/gdpr/v1`,
          description: "Declares privacy/legal processing metadata and subject-rights handling.",
          required: true,
          params: {
            controller_name: "Example State Nuclear Authority (demo)",
            purpose_scope: [
              "journalism_sealed_data_qa",
              "arms_control_verification",
              "compliance_audit",
            ],
            lawful_basis_supported: ["legitimate_interest", "public_interest"],
            retention_policy_days: 14,
            evidence_retention_days: 30,
            audit_retention_days: 30,
            region_policy: "policy_restricted",
          },
        },
        {
          uri: `${origin}/a2a/extensions/near-tee-attestation/v1`,
          description: "Declares NEAR AI Cloud TEE execution attestation metadata and verification status.",
          required: true,
          params: {
            tee_required_default: true,
            attestation_mode: "fail_closed",
            tee_platform: "near_ai_cloud",
            tee_hardware: ["intel_tdx", "nvidia_h200_confidential_compute"],
            connection_mode: "direct_completions",
            model_slug: process.env.NEAR_AI_MODEL_SLUG || "qwen35-122b",
            default_model: process.env.NEAR_AI_MODEL_ID || "Qwen/Qwen3.5-122B-A10B",
            verifier_implementation: "nearai/nearai-cloud-verifier",
            signing_algo: "ecdsa",
            tls_terminates_inside_tee: true,
          },
        },
      ],
    },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text", "application/json"],
    skills: [
      {
        id: "sealed-qa",
        name: "Sealed Data Q&A",
        description:
          "Answer a policy-permitted question about a sealed dataset. Raw records stay inside the TEE; the answer comes with an attestation receipt and the list of fields actually read.",
        tags: ["journalism", "verification", "arms-control", "audit", "near-ai", "tee"],
        examples: [
          "Was any enrichment above 20% observed during the period?",
          "Total HEU-equivalent kg produced across all facilities in H1 2025.",
          "How many months exceeded 19% peak enrichment?",
        ],
      },
    ],
    security: {
      scheme: "service-http",
      note: "Inference is delegated to NEAR AI Cloud authenticated via the host's NEAR_AI_API_KEY. Per-response attestation is fetched and verified before the answer is released.",
    },
  };
}

export function originFromRequest(req: Request): string {
  if (process.env.AGENT_PUBLIC_URL) return process.env.AGENT_PUBLIC_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
