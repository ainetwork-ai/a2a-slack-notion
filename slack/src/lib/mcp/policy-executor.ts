import { executeTool, type ExecuteResult } from "./executor";
import { validatePolicyContext, type DenyReason, type PolicyContext } from "./policy";

export interface PolicyExecuteResult extends ExecuteResult {
  policyDecision: "allow" | "deny";
  denyReason?: DenyReason;
}

export async function executeToolWithPolicy(
  serverId: string,
  toolName: string,
  params: Record<string, unknown>,
  policy: Partial<PolicyContext>,
): Promise<PolicyExecuteResult> {
  const decision = validatePolicyContext(policy);
  if (!decision.allow) {
    return {
      success: false,
      content: `Policy denied: ${decision.reason}`,
      policyDecision: "deny",
      denyReason: decision.reason,
    };
  }
  const result = await executeTool(serverId, toolName, params);
  return { ...result, policyDecision: "allow" };
}
