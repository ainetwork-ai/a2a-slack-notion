"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  dataSlice?: string[];
  attestation?: AttestationBadge;
  error?: string;
}

interface AttestationBadge {
  platform: string;
  modelSlug: string;
  signingAddress?: string;
  intelTdxVerified: boolean;
  nvidiaNrasVerdict: string;
  responseSignatureVerified: boolean;
  attestationVerified: boolean;
  evidenceId?: string;
  fetchedAt: string;
}

const STARTER_QUESTIONS = [
  "Did they cross the red line toward bomb-grade material this year?",
  "How close did they get to weapons-grade?",
  "How much near-weapons-grade material was made in the first half of 2025?",
  "How many months did they stay in the danger zone?",
  "How big is the biggest facility?",
];

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || sending) return;
    const nextHistory: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextHistory);
    setDraft("");
    setSending(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content: data.reply || "",
          dataSlice: data.dataSlice,
          attestation: data.attestation,
        },
      ]);
    } catch (e) {
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content: "",
          error: e instanceof Error ? e.message : "Something went wrong.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-8 px-5 py-8 sm:py-12 lg:grid-cols-[1fr_320px]">
      <section>
        <header className="mb-6">
          <p className="text-[13px] uppercase tracking-[0.18em] text-[color:var(--color-ink-muted)]">
            Sealed Witness · demo
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-tight text-[color:var(--color-ink)] sm:text-4xl">
            Ask the source. Don't expose them.
          </h1>
          <p className="mt-3 text-[color:var(--color-ink-soft)]">
            A source has locked a year of sensitive records from Iran's nuclear program inside a
            hardware safe. Ask what you want to know. You get a straight answer and a cryptographic
            receipt — and the raw records never leave the safe.
          </p>
          <p className="mt-2 text-xs text-[color:var(--color-ink-muted)]">
            All data in this demo is made up. No real facility or person is represented.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              disabled={sending}
              className="rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper-elevated)] px-3 py-1.5 text-xs text-[color:var(--color-ink-soft)] hover:border-[color:var(--color-trust)] hover:text-[color:var(--color-trust)] disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        <section
          aria-label="Query log"
          className="flex flex-col gap-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper-elevated)] p-5 sm:p-7"
        >
          {messages.length === 0 && (
            <p className="text-[color:var(--color-ink-muted)]">
              No questions yet. Type one below, or tap a starter question above.
            </p>
          )}
          {messages.map((m, i) => (
            <QueryCard key={i} message={m} />
          ))}
          {sending && <ThinkingDots />}
          <div ref={endRef} />
        </section>

        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                ask(draft);
              }
            }}
            rows={3}
            placeholder="Ask a question. Totals and yes/no questions are fine. Names and locations will be refused."
            className="w-full resize-y rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper-elevated)] px-4 py-3 text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-trust)]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => ask(draft)}
              disabled={sending || !draft.trim()}
              className="rounded-full bg-[color:var(--color-trust)] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Ask the sealed witness
            </button>
            <span className="text-xs text-[color:var(--color-ink-muted)]">
              ⌘/Ctrl + Enter to send
            </span>
          </div>
        </div>

        <footer className="mt-10 space-y-2 text-xs text-[color:var(--color-ink-muted)]">
          <p>
            Inference runs in a sealed Intel TDX + NVIDIA H200 confidential-compute enclave on{" "}
            <a
              href="https://docs.near.ai/cloud/private-inference/"
              className="underline"
              target="_blank"
              rel="noreferrer noopener"
            >
              NEAR AI Cloud
            </a>
            . Agent card at{" "}
            <a className="underline" href="/.well-known/agent.json">
              /.well-known/agent.json
            </a>
            .
          </p>
        </footer>
      </section>

      <aside className="space-y-5">
        <PolicyPanel />
      </aside>
    </main>
  );
}

function QueryCard({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="rounded-xl border-l-4 border-[color:var(--color-ink)]/30 bg-white/40 px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-[color:var(--color-ink-muted)]">
          Question
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[color:var(--color-ink)]">{message.content}</p>
      </div>
    );
  }
  if (message.error) {
    return (
      <div className="rounded-xl border border-[color:var(--color-warn)]/30 bg-[color:var(--color-warn)]/5 px-4 py-3 text-sm text-[color:var(--color-warn)]">
        {message.error}
      </div>
    );
  }
  const badge = message.attestation;
  const verified = badge?.attestationVerified;
  return (
    <div className="rounded-xl border border-[color:var(--color-line)] bg-white px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--color-ink-muted)]">
        Sealed Witness answer
      </p>
      <p className="mt-1 whitespace-pre-wrap font-serif text-[17px] leading-[1.65] text-[color:var(--color-ink)]">
        {message.content}
      </p>
      {message.dataSlice && message.dataSlice.length > 0 && (
        <div className="mt-3 rounded-lg bg-[color:var(--color-paper)] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-[color:var(--color-ink-muted)]">
            Data slice actually read
          </p>
          <p className="mt-1 font-mono text-xs text-[color:var(--color-ink-soft)]">
            {message.dataSlice.join(" · ")}
          </p>
        </div>
      )}
      {badge && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            verified
              ? "bg-[color:var(--color-trust-soft)] text-[color:var(--color-trust)]"
              : "bg-[color:var(--color-paper)] text-[color:var(--color-ink-muted)]"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {verified ? "Attestation verified" : "Attestation incomplete"}
            </span>
            <span>Intel TDX {badge.intelTdxVerified ? "✓" : "—"}</span>
            <span>NVIDIA NRAS {badge.nvidiaNrasVerdict}</span>
            <span>Sig {badge.responseSignatureVerified ? "✓" : "—"}</span>
            {badge.signingAddress && (
              <span className="font-mono">Signer {shorten(badge.signingAddress)}</span>
            )}
            {badge.evidenceId && (
              <span className="font-mono">Evidence {shorten(badge.evidenceId)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 text-[color:var(--color-ink-muted)]">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
      <span className="text-xs">Enclave is computing</span>
    </div>
  );
}

function PolicyPanel() {
  return (
    <div className="sticky top-8 space-y-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper-elevated)] p-5 text-sm">
      <div>
        <h2 className="font-serif text-lg text-[color:var(--color-ink)]">What's inside the safe</h2>
        <p className="mt-1 text-[color:var(--color-ink-soft)]">
          A year of monthly records from three sites: how much material was made, and how pure
          (enriched) it was. The site names and the people who work there stay hidden — the
          hardware never lets them out.
        </p>
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-[color:var(--color-trust)]">
          You can ask
        </h3>
        <ul className="mt-1 list-disc pl-5 text-[color:var(--color-ink-soft)]">
          <li>Totals over the year</li>
          <li>Highest or lowest observed</li>
          <li>How many months crossed a line</li>
          <li>Yes / no: did they break a limit?</li>
          <li>The single most alarming number</li>
        </ul>
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-[color:var(--color-warn)]">
          You can't ask (will be refused)
        </h3>
        <ul className="mt-1 list-disc pl-5 text-[color:var(--color-ink-soft)]">
          <li>Which specific site did what</li>
          <li>Names or headcounts of people</li>
          <li>Exact locations</li>
          <li>Who sold them the equipment</li>
          <li>Any raw row from the records</li>
        </ul>
      </div>
      <div className="rounded-lg bg-[color:var(--color-paper)] p-3 text-xs text-[color:var(--color-ink-muted)]">
        <p className="font-medium text-[color:var(--color-ink-soft)]">Why this matters</p>
        <p className="mt-1">
          The source keeps control of the raw records. The journalist still gets answers they can
          verify. Neither side has to trust the other — the hardware is the referee.
        </p>
      </div>
    </div>
  );
}

function shorten(v?: string) {
  if (!v) return "—";
  if (v.length <= 14) return v;
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}
