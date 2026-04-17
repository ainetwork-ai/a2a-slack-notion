import { callVLLM } from "@/lib/a2a/vllm-handler";
import type { AgentProvider, ProviderRequest, ProviderResult } from "./types";

export const standardProvider: AgentProvider = {
  kind: "standard",
  async infer(req: ProviderRequest): Promise<ProviderResult> {
    const content = await callVLLM(req.systemPrompt, req.userContent);
    return { kind: "standard", content, attestationVerified: false };
  },
};
