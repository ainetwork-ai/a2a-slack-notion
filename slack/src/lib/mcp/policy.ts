export interface PolicyContext {
  requestId: string;
  purposeId: string;
  legalBasis: string;
  retentionDays: number;
  teeRequired: boolean;
  regionPolicy?: string;
  minimizationProfile?: string;
}

export const ALLOWED_PURPOSE_IDS = ["journalism_source_protection"] as const;
export const ALLOWED_LEGAL_BASES = ["legitimate_interest", "public_interest"] as const;
export const MAX_RETENTION_DAYS = 30;

export type DenyReason =
  | "missing_purpose_id"
  | "disallowed_purpose_id"
  | "missing_legal_basis"
  | "disallowed_legal_basis"
  | "retention_exceeds_max"
  | "missing_request_id"
  | "tee_required_on_non_tee_provider"
  | "region_policy_mismatch";

export interface PolicyDecision {
  allow: boolean;
  reason?: DenyReason;
}

export function validatePolicyContext(ctx: Partial<PolicyContext>): PolicyDecision {
  if (!ctx.requestId) return { allow: false, reason: "missing_request_id" };
  if (!ctx.purposeId) return { allow: false, reason: "missing_purpose_id" };
  if (!ALLOWED_PURPOSE_IDS.includes(ctx.purposeId as typeof ALLOWED_PURPOSE_IDS[number])) {
    return { allow: false, reason: "disallowed_purpose_id" };
  }
  if (!ctx.legalBasis) return { allow: false, reason: "missing_legal_basis" };
  if (!ALLOWED_LEGAL_BASES.includes(ctx.legalBasis as typeof ALLOWED_LEGAL_BASES[number])) {
    return { allow: false, reason: "disallowed_legal_basis" };
  }
  if (typeof ctx.retentionDays !== "number" || ctx.retentionDays > MAX_RETENTION_DAYS) {
    return { allow: false, reason: "retention_exceeds_max" };
  }
  return { allow: true };
}
