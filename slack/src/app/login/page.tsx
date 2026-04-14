'use client';

import Web3Provider from '@/components/Web3Provider';
import WalletLogin from '@/components/auth/WalletLogin';

export default function LoginPage() {
  return (
    <Web3Provider>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a1d21] via-[#1e1124] to-[#0d1117] p-4">
        <WalletLogin />
      </div>
    </Web3Provider>
  );
}
