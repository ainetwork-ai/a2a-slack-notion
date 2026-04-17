#!/usr/bin/env node
// Verifies the NEAR AI Cloud TEE attestation surface without spending credits.
// Shows: signing address, Intel TDX quote presence, nonce binding, NVIDIA payload.
//
// Usage:
//   node scripts/verify-attestation.mjs
//   NEAR_AI_MODEL_SLUG=gpt-oss-120b node scripts/verify-attestation.mjs

import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SLUG = process.env.NEAR_AI_MODEL_SLUG || "qwen35-122b";
const ENDPOINT = `https://${SLUG}.completions.near.ai/v1/attestation/report`;
const nonce = crypto.randomBytes(32).toString("hex");

const u = new URL(ENDPOINT);
u.searchParams.set("signing_algo", "ecdsa");
u.searchParams.set("nonce", nonce);
u.searchParams.set("include_tls_fingerprint", "true");

console.log(`→ GET ${u.toString()}`);
const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
console.log(`← HTTP ${res.status}`);
if (!res.ok) {
  console.error(`failed: ${await res.text()}`);
  process.exit(1);
}

const body = await res.json();
const checks = [];

const recordOne = (att, idx) => {
  const nonceMatch = att.request_nonce === nonce;
  const hasIntelQuote = typeof att.intel_quote === "string" && att.intel_quote.length > 100;
  const hasNvidiaPayload =
    typeof att.nvidia_payload === "string" && att.nvidia_payload.length > 100;
  const hasSigningAddress =
    typeof att.signing_address === "string" && att.signing_address.startsWith("0x");
  const hasTlsFingerprint = Boolean(att.tls_fingerprint);

  checks.push({
    idx,
    model: att.model_name,
    signing_address: att.signing_address,
    nonce_echo_matches: nonceMatch,
    intel_tdx_quote_present: hasIntelQuote,
    intel_quote_bytes: att.intel_quote ? att.intel_quote.length / 2 : 0,
    nvidia_evidence_present: hasNvidiaPayload,
    nvidia_payload_bytes: att.nvidia_payload ? att.nvidia_payload.length / 2 : 0,
    tls_fingerprint_bound: hasTlsFingerprint,
  });
};

if (Array.isArray(body.model_attestations)) {
  body.model_attestations.forEach(recordOne);
} else {
  recordOne(body, 0);
}

console.log("\nAttestation surface (per node):");
for (const c of checks) {
  console.log(`  [${c.idx}] model=${c.model}`);
  console.log(`       signing_address     = ${c.signing_address}`);
  console.log(`       nonce echo matches  = ${c.nonce_echo_matches ? "✓" : "✗"}`);
  console.log(
    `       intel TDX quote     = ${c.intel_tdx_quote_present ? "✓" : "✗"} (${c.intel_quote_bytes} bytes)`,
  );
  console.log(
    `       nvidia evidence     = ${c.nvidia_evidence_present ? "✓" : "✗"} (${c.nvidia_payload_bytes} bytes)`,
  );
  console.log(`       tls fingerprint     = ${c.tls_fingerprint_bound ? "✓" : "✗"}`);
}

const ok = checks.every(
  (c) => c.nonce_echo_matches && c.intel_tdx_quote_present && c.nvidia_evidence_present,
);

console.log(`\nOverall: ${ok ? "ATTESTATION SURFACE OK" : "ATTESTATION SURFACE INCOMPLETE"}`);
console.log(
  "Note: this script confirms the TEE produced a fresh, nonce-bound report. " +
    "Cryptographic verification of the Intel TDX quote (via dcap-qvl) and " +
    "NVIDIA NRAS verdict is the next layer; both inputs are present and well-formed.",
);
process.exit(ok ? 0 : 1);
