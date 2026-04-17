/**
 * Share layout — no sidebar, no channel list.
 * Minimal shell: top bar with page title + sign-in CTA, then the page body.
 *
 * `params` are passed in from the token-specific page so layout can show
 * the title. However, Next.js layouts receive `params` from the nearest
 * segment — we expose a `data-share-title` attribute via the page component
 * itself; the title here is handled by the page-level <title> metadata.
 * The layout simply provides the chrome wrapper.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Shared page — Slack-Notion',
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#1a1d21] flex flex-col">
      {/* Top bar */}
      <header className="shrink-0 border-b border-white/10 bg-[#1a1d21]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[880px] mx-auto px-6 md:px-12 h-12 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-slate-300 tracking-wide">
            Slack-Notion
          </span>
          <Link
            href="/workspace"
            className="text-xs text-slate-400 hover:text-white transition-colors border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-md"
          >
            Sign in to comment
          </Link>
        </div>
      </header>

      {/* Page body */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
