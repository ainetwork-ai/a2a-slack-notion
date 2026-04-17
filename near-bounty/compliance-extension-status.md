# A2A Compliance Extension — Legal & Spec Status

Question answered: *Is there an official A2A "compliance" capability/extension we
must use? Are our custom `gdpr` and `near-tee-attestation` extensions legally
allowed?*

**Short answer: No official one exists yet, and yes — community-defined
extensions like ours are explicitly sanctioned by the A2A specification.**

---

## What the A2A spec says

From the official Extensions topic:
- "Anyone is able to define, publish, and implement an extension."
- Each extension is identified by a unique URI.
- Extensions are declared in the Agent Card under
  `capabilities.extensions[]` as `AgentExtension` objects with
  `{ uri, description, required, params }`.
- When an extension is `required: true`, clients MUST honour it; otherwise it
  is informational.

**Reserved namespace**: official extensions use the URI prefix
`https://a2a-protocol.org/extensions/` and live in `a2aproject/ext-*` repos.
Experimental ones use `a2aproject/experimental-ext-*`.

---

## What official extensions actually exist today

Enumerated against the public `github.com/orgs/a2aproject/repos` API on
2026-04-16:

```
.github
A2A                — protocol spec
a2a-dotnet         — .NET SDK
a2a-go             — Go SDK
a2a-inspector      — validation tools
a2a-java           — Java SDK
a2a-js             — JavaScript SDK
a2a-python         — Python SDK
a2a-rs             — Rust SDK
a2a-samples        — example agents
a2a-tck            — test compatibility kit
```

**Zero `ext-*` or `experimental-ext-*` repos.** The reserved namespace is
empty. There is no official GDPR, privacy, compliance, attestation, or TEE
extension to plug into.

Known *community*-published extensions (per Google's blog and ecosystem
search):

| Extension | Author | Purpose |
|---|---|---|
| Traceability | Google sample | logging / diagnostics |
| Latency | Twilio | voice agent model selection |
| Zero-Trust | Identity Machines | agent-to-agent security handshakes |
| x402 | Community | crypto payments via HTTP 402 semantics |

None of these address GDPR/PIPA-style data-protection compliance.

---

## Therefore

Our two extensions are **legally compliant with the A2A spec** as long as we
follow these rules:

1. **Do not** use the reserved `https://a2a-protocol.org/extensions/` prefix.
   We use our deployment URL (`${AGENT_PUBLIC_URL}/a2a/extensions/...`)
   instead. `lib/agent-card.ts` substitutes the placeholder
   `https://near-bounty.example` with the actual Vercel URL at request time.
2. Declare them in `capabilities.extensions[]` as `AgentExtension` objects.
3. Set `required: true` for both — they describe non-negotiable processing
   semantics (GDPR/PIPA controls and TEE-attested execution gating).
4. Publish a stable `description` and machine-readable `params`. ✅ done.
5. Optionally serve a JSON Schema for the extension at the URI for
   discoverability. (Not required by the spec; nice-to-have.)

---

## Our two extension URIs (post-deployment)

After Vercel deploy, the agent card served at
`https://<deployment>/.well-known/agent.json` will declare:

```
${AGENT_PUBLIC_URL}/a2a/extensions/gdpr/v1
${AGENT_PUBLIC_URL}/a2a/extensions/near-tee-attestation/v1
```

Both `required: true`. The first encodes purpose-limitation, retention TTLs,
DSAR endpoint, and the policy contract for incoming requests. The second
encodes connection mode, model, attestation endpoint, signature endpoint,
and verifier implementation pointer.

---

## Forward path if A2A publishes an official compliance extension

If `a2aproject/ext-compliance` (or similar) lands in the future, we will:

1. Read its schema.
2. Map our existing `params` to the official field names.
3. Replace our extension URI with the official one and keep our URI as a
   secondary, informational entry for the existing fields the official spec
   does not cover (e.g., NEAR AI specifics).

Until then, our community extensions are the canonical machine-readable
declaration for this agent's compliance and attestation posture.

---

## Sources

- A2A extensions spec: https://a2a-protocol.org/latest/topics/extensions/
- A2A enterprise topics: https://a2a-protocol.org/latest/topics/enterprise-ready/
- Google blog on A2A extensions:
  https://developers.googleblog.com/en/a2a-extensions-empowering-custom-agent-functionality/
- a2aproject org: https://github.com/a2aproject
- Live repo enumeration: `GET https://api.github.com/orgs/a2aproject/repos`
  (no `ext-*` or `experimental-ext-*` as of 2026-04-16)
