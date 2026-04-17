-- War Desk Source Shield: editorial briefs persisted with NEAR AI Cloud TEE attestation evidence
CREATE TABLE IF NOT EXISTS "editorial_briefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "channel_id" uuid REFERENCES "channels"("id") ON DELETE SET NULL,
  "incident_id" text NOT NULL,
  "request_id" text NOT NULL,
  "purpose_id" text NOT NULL,
  "legal_basis" text NOT NULL,
  "public_safe_brief" text NOT NULL,
  "hold_back_items" jsonb DEFAULT '[]'::jsonb,
  "verification_checklist" jsonb DEFAULT '[]'::jsonb,
  "source_exposure_risk_score" integer,
  "tee_platform" text,
  "signing_address" text,
  "chat_id" text,
  "attestation_evidence_id" text,
  "attestation_verified" boolean DEFAULT false NOT NULL,
  "intel_tdx_verified" boolean DEFAULT false,
  "nvidia_nras_verdict" text,
  "response_signature_verified" boolean DEFAULT false,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editorial_briefs_workspace_idx" ON "editorial_briefs" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editorial_briefs_incident_idx" ON "editorial_briefs" ("incident_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editorial_briefs_expires_idx" ON "editorial_briefs" ("expires_at");
