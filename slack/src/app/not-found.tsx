'use client';

import Link from 'next/link';
import { MessageSquareOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#1a1d21] flex items-center justify-center">
      <div className="text-center">
        <MessageSquareOff className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-slate-400 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/workspace"
          className="inline-flex items-center px-4 py-2 bg-[#4a154b] hover:bg-[#5b2b5c] text-white rounded-lg transition-colors"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
