import Link from 'next/link';
import { LinkIcon } from 'lucide-react';

export default function ShareNotFound() {
  return (
    <div className="min-h-screen bg-[#1a1d21] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <LinkIcon className="w-14 h-14 text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">
          This link is invalid or has expired
        </h1>
        <p className="text-slate-400 mb-4">
          The share link you followed no longer works. It may have been revoked
          by the owner, or its expiry date has passed.
        </p>
        <p className="text-slate-500 text-sm mb-8">
          If you believe this is an error, ask the page owner to create a new
          share link.
        </p>
        <Link
          href="/workspace"
          className="inline-flex items-center px-4 py-2 bg-[#4a154b] hover:bg-[#5b2b5c] text-white rounded-lg transition-colors text-sm"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
