import { v4 as uuidv4 } from "uuid";

export function generateChallenge(): { nonce: string; message: string } {
  const nonce = uuidv4();
  const message = `Sign in to Slack-A2A: ${nonce}`;
  return { nonce, message };
}

export function verifyAinSignature(
  message: string,
  signature: string,
  address: string
): boolean {
  try {
    const Ain = require("@ainblockchain/ain-js").default;
    const ain = new Ain("https://devnet-api.ainetwork.ai");
    return ain.wallet.verifySignature(message, signature, address);
  } catch {
    return false;
  }
}

export function recoverAddress(message: string, signature: string): string | null {
  try {
    const Ain = require("@ainblockchain/ain-js").default;
    const ain = new Ain("https://devnet-api.ainetwork.ai");
    return ain.wallet.recover(signature);
  } catch {
    return null;
  }
}
