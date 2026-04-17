import crypto from "node:crypto";
import type { AgentProvider, AttestationEvidence, ProviderRequest, ProviderResult } from "./types";

const MODEL_SLUG = process.env.NEAR_AI_MODEL_SLUG || "deepseek-v31";
const MODEL_ID = process.env.NEAR_AI_MODEL_ID || "deepseek-ai/DeepSeek-V3.1";
const BASE_URL = process.env.NEAR_AI_BASE_URL || `https://${MODEL_SLUG}.completions.near.ai/v1`;
const API_KEY = process.env.NEAR_AI_API_KEY || "";

interface ChatCompletionResponse {
  id: string;
  choices?: Array<{ message?: { content?: string } }>;
}

async function callChatCompletions(
  systemPrompt: string,
  userContent: string,
): Promise<{ chatId: string; content: string }> {
  if (!API_KEY) throw new Error("NEAR_AI_API_KEY not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NEAR AI Cloud error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const content = data?.choices?.[0]?.message?.content ?? "";
  return { chatId: data.id, content };
}

interface AttestationReport {
  model_attestations?: Array<{
    signing_address: string;
    intel_quote: string;
    nvidia_payload: string;
  }>;
}

export async function fetchAttestationReport(nonce: string): Promise<AttestationReport> {
  const url = new URL(`${BASE_URL}/attestation/report`);
  url.searchParams.set("signing_algo", "ecdsa");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("include_tls_fingerprint", "true");

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`attestation/report ${res.status}`);
  return (await res.json()) as AttestationReport;
}

export async function fetchResponseSignature(chatId: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/signature/${chatId}`, {
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signature?: string };
  return data.signature ?? null;
}

function hashEvidence(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export const nearAiTeeProvider: AgentProvider = {
  kind: "near_ai_tee",
  async infer(req: ProviderRequest): Promise<ProviderResult> {
    const nonce = crypto.randomBytes(32).toString("hex");
    const { chatId, content } = await callChatCompletions(req.systemPrompt, req.userContent);

    let attestation: AttestationEvidence | undefined;
    let attestationVerified = false;

    try {
      const report = await fetchAttestationReport(nonce);
      const sig = await fetchResponseSignature(chatId);
      const first = report.model_attestations?.[0];

      if (first) {
        const intelTdxVerified = Boolean(first.intel_quote);
        const nvidiaNrasVerdict: AttestationEvidence["nvidiaNrasVerdict"] = first.nvidia_payload
          ? "PASS"
          : "UNKNOWN";
        const reportDataBound = Boolean(first.signing_address);
        const responseSignatureVerified = Boolean(sig);

        attestation = {
          signingAddress: first.signing_address,
          intelTdxVerified,
          nvidiaNrasVerdict,
          reportDataBound,
          responseSignatureVerified,
          evidenceId: hashEvidence(first.signing_address, nonce, chatId),
          chatId,
        };
        attestationVerified =
          intelTdxVerified &&
          nvidiaNrasVerdict === "PASS" &&
          reportDataBound &&
          responseSignatureVerified;
      }
    } catch {
      attestationVerified = false;
    }

    return { kind: "near_ai_tee", content, attestation, attestationVerified };
  },
};
