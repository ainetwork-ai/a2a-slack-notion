/**
 * Simple vLLM caller for A2A agent endpoints.
 * Used by the dynamic /api/a2a/[agentId] route to handle message/send requests.
 */

const VLLM_URL = process.env.VLLM_URL || "http://localhost:8100/v1/chat/completions";
const VLLM_MODEL = process.env.VLLM_MODEL || "gemma-4-31B-it";

export async function callVLLM(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const res = await fetch(VLLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VLLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`vLLM error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "I could not generate a response.";
}
