import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { generateChallenge } from "@/lib/auth/ain-verify";

export async function GET() {
  console.log("[Auth:Challenge] Generating challenge...");
  const session = await getSession();
  const { nonce, message } = generateChallenge();
  session.challenge = nonce;
  await session.save();
  console.log("[Auth:Challenge] Challenge saved to session, nonce:", nonce.slice(0, 8) + "...");
  return NextResponse.json({ nonce, message });
}
