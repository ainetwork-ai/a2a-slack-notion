import { createConfig, http } from 'wagmi';
import { mainnet, base, baseSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Use CORS-friendly RPCs; default wagmi public RPC (eth.merkle.io) blocks browser requests
const MAINNET_RPC = process.env.NEXT_PUBLIC_MAINNET_RPC || 'https://cloudflare-eth.com';
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC || 'https://mainnet.base.org';
const BASE_SEPOLIA_RPC = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || 'https://sepolia.base.org';

export const config = createConfig({
  chains: [mainnet, base, baseSepolia],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(MAINNET_RPC),
    [base.id]: http(BASE_RPC),
    [baseSepolia.id]: http(BASE_SEPOLIA_RPC),
  },
});
