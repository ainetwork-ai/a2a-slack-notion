import type { PolicyContext } from "@/lib/mcp/policy";
import type { AgentProvider, ProviderKind } from "./providers/types";
import { nearAiTeeProvider } from "./providers/near-ai-tee";
import { standardProvider } from "./providers/standard";

export type Route = "TEE_REQUIRED" | "STANDARD";

export function decideRoute(policy: PolicyContext): Route {
  if (policy.teeRequired) return "TEE_REQUIRED";
  if (policy.purposeId === "journalism_source_protection") return "TEE_REQUIRED";
  return "STANDARD";
}

export function pickProvider(route: Route): AgentProvider {
  return route === "TEE_REQUIRED" ? nearAiTeeProvider : standardProvider;
}

export function providerKindForRoute(route: Route): ProviderKind {
  return route === "TEE_REQUIRED" ? "near_ai_tee" : "standard";
}
