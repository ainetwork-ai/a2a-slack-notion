import { createPublicClient, http, hashMessage, recoverAddress } from "viem";
import { mainnet } from "viem/chains";

const MAINNET_RPC = process.env.MAINNET_RPC || process.env.NEXT_PUBLIC_MAINNET_RPC || "https://cloudflare-eth.com";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MAINNET_RPC),
});

export async function verifyEthSignature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    // First try EOA recovery (cheap, no RPC needed)
    const recovered = await recoverAddress({
      hash: hashMessage(message),
      signature: signature as `0x${string}`,
    });
    if (recovered.toLowerCase() === address.toLowerCase()) {
      return true;
    }

    // Fall back to ERC-1271 (smart contract wallets) — requires RPC
    try {
      const valid = await publicClient.verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
      return valid;
    } catch (rpcErr) {
      console.error("[ETH verify] ERC-1271 check failed:", rpcErr);
      return false;
    }
  } catch (e) {
    console.error("[ETH verify] EOA recovery failed:", e);
    return false;
  }
}
