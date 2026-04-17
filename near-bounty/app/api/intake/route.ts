import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, fetchAttestation, newNonce, type ChatMessage } from "@/lib/near-ai";
import { SEALED_ANALYST_SYSTEM_PROMPT } from "@/lib/analyst-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

interface IntakeBody {
  history: IncomingMessage[];
}

const SLICE_MARKER = "DATA SLICE:";

function splitSlice(content: string): { reply: string; dataSlice?: string[] } {
  const idx = content.lastIndexOf(SLICE_MARKER);
  if (idx === -1) return { reply: content };
  const reply = content.slice(0, idx).trim();
  const tail = content.slice(idx + SLICE_MARKER.length).trim();
  if (!tail || /^none$/i.test(tail)) return { reply, dataSlice: [] };
  const fields = tail
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { reply, dataSlice: fields };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as IntakeBody;
  if (!Array.isArray(body.history) || body.history.length === 0) {
    return NextResponse.json({ error: "history required" }, { status: 400 });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SEALED_ANALYST_SYSTEM_PROMPT },
    ...body.history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let chatId = "";
  let content = "";
  try {
    const res = await chatCompletion(messages);
    chatId = res.chatId;
    content = res.content;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "inference failed" },
      { status: 502 },
    );
  }

  const nonce = newNonce();
  const attestation = await fetchAttestation(nonce, chatId);
  const { reply, dataSlice } = splitSlice(content);

  return NextResponse.json({
    reply,
    dataSlice,
    attestation,
    nonce,
  });
}
