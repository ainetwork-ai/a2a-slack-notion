import { AzureOpenAI, OpenAI } from 'openai';

// ─────────────────────────────────────────────────────────────
// Unified LLM caller. Mirrors the contract used by the parent
// a2a-agent-builder project so the same env vars drop in:
//
//   Option A (custom gateway, OpenAI-compatible):
//     LLM_API_URL, LLM_MODEL, [LLM_API_KEY]
//
//   Option B (Azure OpenAI):
//     AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY,
//     [AZURE_OPENAI_API_VERSION] (default "2024-12-01-preview"),
//     [AZURE_OPENAI_DEPLOYMENT]  (default "gpt-4o")
//
// The client is created lazily so that `next build` doesn't explode when
// env vars aren't set at build time (they're only needed at request time).
// ─────────────────────────────────────────────────────────────

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

let cachedClient: OpenAI | AzureOpenAI | null = null;
let cachedModel: string = 'gpt-4o';

function resolveClient(): { client: OpenAI | AzureOpenAI; model: string } {
  if (cachedClient) return { client: cachedClient, model: cachedModel };

  const apiUrl = process.env.LLM_API_URL;
  const customModel = process.env.LLM_MODEL;

  if (apiUrl && customModel) {
    // Option A — custom gateway, OpenAI-compatible.
    // OpenAI SDK appends `/chat/completions` to baseURL on every call, so
    // if the env var already ends in that path (a common gateway convention)
    // we must strip it — otherwise the request hits `/chat/completions/chat/completions` → 404.
    const baseURL = apiUrl.replace(/\/chat\/completions$/, '');
    cachedClient = new OpenAI({
      apiKey: process.env.LLM_API_KEY || 'not-required',
      baseURL,
    });
    // Use the full model string as-is (some gateways expect
    // namespaced routes like "gemma/gemma-3-27b-it").
    cachedModel = customModel;
    return { client: cachedClient, model: cachedModel };
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  if (endpoint && apiKey) {
    cachedClient = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
    });
    // Deployment name. Support both `AZURE_OPENAI_DEPLOYMENT` (what our
    // .env.example documents) and `AZURE_OPENAI_MODEL` (what the sibling
    // a2a-agent-builder project uses), so users can copy either env file
    // over without renaming.
    cachedModel =
      process.env.AZURE_OPENAI_DEPLOYMENT ||
      process.env.AZURE_OPENAI_MODEL ||
      'gpt-4o';
    return { client: cachedClient, model: cachedModel };
  }

  throw new Error(
    'LLM not configured: set LLM_API_URL+LLM_MODEL, or AZURE_OPENAI_ENDPOINT+AZURE_OPENAI_KEY',
  );
}

export async function callLLM(messages: Msg[]): Promise<string> {
  const { client, model } = resolveClient();
  const resp = await client.chat.completions.create({
    model,
    messages,
  });
  return resp.choices[0]?.message?.content ?? '';
}
