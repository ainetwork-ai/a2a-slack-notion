# Why TEE — Concretely, for This Scenario

The scenario: a frightened source talks to an AI journalist on a public web
page about a hostage situation. They might mention names, locations, or
details that — if they leaked — could get someone killed.

This document is the answer to the question *"OK, but what does TEE
actually buy us here that a normal cloud LLM API doesn't?"* It is written
to be defensible in front of a judge, a lawyer, or the source themselves.

---

## What changes when you swap a normal LLM for NEAR AI Cloud TEE

| Risk vector | Standard cloud LLM (OpenAI / Anthropic / etc.) | NEAR AI Cloud TEE (Intel TDX + NVIDIA H200 CC) |
|---|---|---|
| Provider can read the conversation | ✅ Yes — that's how their abuse-monitoring works (typically 30-day retention) | ❌ No — TLS terminates *inside* the enclave; plaintext never exists outside the chip |
| Cloud infra operator can RAM-dump the running process | ✅ Possible | ❌ Memory is hardware-encrypted |
| Insider at the AI vendor can pull logs | ✅ With privileges, yes | ❌ The data is not in their plaintext storage by construction |
| Subpoena to the AI vendor produces logs | ✅ Yes | ❌ Vendor has nothing readable to hand over |
| Source must *trust* the vendor's privacy claims | ✅ Trust-me model | ❌ Cryptographic proof per response (Intel TDX quote + NVIDIA NRAS verdict) |
| Newsroom organisation itself can read the source's words | ✅ If they kept logs | ❌ We don't keep logs; even if we did, plaintext only existed inside the enclave |

---

## The five concrete benefits, ranked by importance for this scenario

### 1. The source gets cryptographic proof, not a promise
The trust banner in the UI flips green only when four independent checks
pass: Intel TDX quote validates, NVIDIA NRAS returns `PASS`, the
attestation `report_data` binds the request nonce + signing key, and the
specific response was signed by that same enclave. The source — or anyone
they trust — can re-verify these against Intel and NVIDIA's public
attestation services. **No vendor's word is required.** This is the
single most important property when the source is afraid.

### 2. Subpoena defence by construction
A newsroom can be served with a subpoena (and a gag order) demanding
source records. With a standard cloud LLM, those records exist in the
vendor's logs and are reachable. With our setup, *the plaintext never
existed outside the enclave* — the audit trail records that a request
happened and that attestation verified, but never the words. This is the
strongest legal posture short of not running the service at all.

### 3. Insider threat removed
The newsroom's own employees, ops staff, and contractors cannot read what
the source said. This matters because real-world source compromises
historically come from insiders far more often than from external attacks.

### 4. TLS terminates inside the TEE
Standard cloud LLM endpoints terminate TLS at a load balancer, then
plaintext flows over the internal network to the model. NEAR AI Cloud's
direct-completions mode terminates TLS *inside the model's TEE*. So even
the legitimate cloud operator cannot do a man-in-the-middle. This is
unusual and worth highlighting in the demo.

### 5. Compliance posture is defensible
GDPR Art.32 and Korea PIPA "safety measures" both require "appropriate
technical measures." Hardware-attested confidential compute is one of the
strongest available technical measures. It is much easier to defend in a
regulatory review than "we trust our SaaS vendor's privacy policy."

---

## What TEE does NOT solve (be honest)

- **The AI can still mishandle data semantically.** TEE protects the
  conversation from third parties; it does not stop the model from
  generating something inappropriate. We mitigate this with the
  trauma-informed system prompt and the `hold_back_items` field.
- **The source's own device can be compromised.** Anything that shoulder-
  surfs the browser sees plaintext. This is outside our threat model.
- **Output destination is still trust-based.** If the source agrees to a
  brief being published, that brief leaves the enclave. TEE protects
  *processing*, not *publication*.
- **Side-channel research is ongoing.** Intel TDX and NVIDIA CC are not
  perfect; new side-channel attacks are published periodically. We accept
  this residual risk; no real system is perfect.

---

## "Why not just self-host an open-source model?"

You can. But then the source has to trust *your* server administrators
instead of NEAR's. That swap doesn't help them. The whole point of TEE
attestation is that the source needs to trust *no one* — they verify the
hardware proof themselves. Self-hosting without TEE re-introduces the
insider-threat problem; self-hosting *with* TEE is exactly what NEAR AI
Cloud already gives us, without us having to operate Intel TDX + H200
infrastructure.

---

## The killer line for the demo

> "Most newsroom intake forms ask you to trust the newsroom. This one
> doesn't ask you to trust anyone. The hardware proves it."

That sentence is the elevator pitch.
