import { verifyMessage } from "viem";

export async function verifyEthSignature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid;
  } catch {
    return false;
  }
}
