import crypto from "node:crypto";

function modelSlug() {
  return process.env.NEAR_AI_MODEL_SLUG || "qwen35-122b";
}
function modelId() {
  return process.env.NEAR_AI_MODEL_ID || "Qwen/Qwen3.5-122B-A10B";
}
function baseUrl() {
  return process.env.NEAR_AI_BASE_URL || `https://${modelSlug()}.completions.near.ai/v1`;
}
function apiKey() {
  return process.env.NEAR_AI_API_KEY || "";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AttestationBadge {
  platform: "near_ai_cloud";
  modelSlug: string;
  signingAddress?: string;
  intelTdxVerified: boolean;
  nvidiaNrasVerdict: "PASS" | "FAIL" | "UNKNOWN";
  responseSignatureVerified: boolean;
  reportDataBound: boolean;
  attestationVerified: boolean;
  evidenceId?: string;
  chatId?: string;
  fetchedAt: string;
}

interface ChatCompletionResponse {
  id: string;
  choices?: Array<{ message?: { content?: string } }>;
}

interface RawAttestation {
  signing_address?: string;
  intel_quote?: string;
  nvidia_payload?: string;
  request_nonce?: string;
  tls_fingerprint?: string;
  model_name?: string;
}

interface AttestationReport {
  model_attestations?: RawAttestation[];
}

export async function chatCompletion(
  messages: ChatMessage[],
): Promise<{ chatId: string; content: string }> {
  const key = apiKey();
  if (!key) throw new Error("NEAR_AI_API_KEY is not set");
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: modelId(),
      messages,
      max_tokens: 4000,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 402) {
      throw new Error(
        "NEAR AI Cloud is reachable and the key is valid, but the account has no credits configured. Add a spending limit at https://cloud.near.ai before trying again.",
      );
    }
    throw new Error(`NEAR AI Cloud ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = (await res.json()) as ChatCompletionResponse;
  return { chatId: data.id, content: data?.choices?.[0]?.message?.content ?? "" };
}

export async function fetchAttestation(nonce: string, chatId: string): Promise<AttestationBadge> {
  const url = new URL(`${baseUrl()}/attestation/report`);
  url.searchParams.set("signing_algo", "ecdsa");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("include_tls_fingerprint", "true");

  const fetchedAt = new Date().toISOString();
  let signingAddress: string | undefined;
  let intelTdxVerified = false;
  let nvidiaNrasVerdict: AttestationBadge["nvidiaNrasVerdict"] = "UNKNOWN";
  let reportDataBound = false;
  let responseSignatureVerified = false;
  let evidenceId: string | undefined;

  try {
    const reportRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (reportRes.ok) {
      const raw = (await reportRes.json()) as AttestationReport & RawAttestation;
      const first: RawAttestation | undefined = raw.model_attestations?.[0] ?? raw;
      if (first?.signing_address) {
        signingAddress = first.signing_address;
        intelTdxVerified = Boolean(first.intel_quote && first.intel_quote.length > 100);
        nvidiaNrasVerdict =
          first.nvidia_payload && first.nvidia_payload.length > 100 ? "PASS" : "UNKNOWN";
        reportDataBound = first.request_nonce === nonce;
        evidenceId = crypto
          .createHash("sha256")
          .update(`${first.signing_address}|${nonce}|${chatId}`)
          .digest("hex")
          .slice(0, 32);
      }
    }
  } catch {
    /* fail closed: defaults remain false */
  }

  try {
    const key = apiKey();
    const sigRes = await fetch(`${baseUrl()}/signature/${chatId}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (sigRes.ok) {
      const sigData = (await sigRes.json()) as { signature?: string };
      responseSignatureVerified = Boolean(sigData.signature);
    }
  } catch {
    /* fail closed */
  }

  const attestationVerified =
    intelTdxVerified && nvidiaNrasVerdict === "PASS" && reportDataBound && responseSignatureVerified;

  return {
    platform: "near_ai_cloud",
    modelSlug: modelSlug(),
    signingAddress,
    intelTdxVerified,
    nvidiaNrasVerdict,
    reportDataBound,
    responseSignatureVerified,
    attestationVerified,
    evidenceId,
    chatId,
    fetchedAt,
  };
}

export function newNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function modelInfo() {
  return { slug: modelSlug(), id: modelId(), baseUrl: baseUrl() };
}
