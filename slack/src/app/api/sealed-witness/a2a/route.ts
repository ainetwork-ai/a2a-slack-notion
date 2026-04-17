import { NextRequest, NextResponse } from "next/server";
import {
  chatCompletion,
  fetchAttestation,
  newNonce,
  type ChatMessage,
} from "@/lib/sealed-witness/near-ai-cloud";
import { SEALED_ANALYST_SYSTEM_PROMPT } from "@/lib/sealed-witness/analyst-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function jsonRpcError(id: string | number, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

interface MessagePart {
  kind: "text";
  text: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as JsonRpcRequest;
  if (body.jsonrpc !== "2.0") return jsonRpcError(body.id, -32600, "invalid jsonrpc version");
  if (body.method !== "message/send") return jsonRpcError(body.id, -32601, "method not supported");

  const message = body.params?.message as { parts?: MessagePart[] } | undefined;
  const text = message?.parts?.find((p) => p.kind === "text")?.text ?? "";
  if (!text) return jsonRpcError(body.id, -32602, "message.parts[].text required");

  const messages: ChatMessage[] = [
    { role: "system", content: SEALED_ANALYST_SYSTEM_PROMPT },
    { role: "user", content: text },
  ];

  let chatId = "";
  let content = "";
  try {
    const res = await chatCompletion(messages);
    chatId = res.chatId;
    content = res.content;
  } catch (err) {
    return jsonRpcError(body.id, -32000, err instanceof Error ? err.message : "inference failed");
  }

  const nonce = newNonce();
  const attestation = await fetchAttestation(nonce, chatId);

  const SLICE_MARKER = "DATA SLICE:";
  const sliceIdx = content.lastIndexOf(SLICE_MARKER);
  const answerText = sliceIdx === -1 ? content : content.slice(0, sliceIdx).trim();
  const dataSlice =
    sliceIdx === -1
      ? []
      : content
          .slice(sliceIdx + SLICE_MARKER.length)
          .trim()
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !/^none$/i.test(s));

  const badge = attestation.attestationVerified
    ? `\n\n_Attested by Sealed Witness · Intel TDX ✓ · NVIDIA NRAS ${attestation.nvidiaNrasVerdict} · Sig ✓ · Evidence ${attestation.evidenceId?.slice(0, 12)}…_`
    : `\n\n_Attestation incomplete — response withheld from authoritative display._`;

  return NextResponse.json({
    jsonrpc: "2.0",
    id: body.id,
    result: {
      kind: "message",
      messageId: chatId,
      role: "agent",
      parts: [{ kind: "text", text: answerText + badge }],
      metadata: { attestation, nonce, dataSlice },
    },
  });
}
