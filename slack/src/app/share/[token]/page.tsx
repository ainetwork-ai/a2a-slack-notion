/**
 * GET /share/:token — public-facing read-only page rendered from a share link.
 *
 * Security model:
 * - NO requireAuth. The share token is the access grant.
 * - isPublic=true: any anonymous visitor can read.
 * - isPublic=false: future work (requires workspace auth check). For now
 *   these tokens return 404 to avoid accidental leaks.
 * - Expired tokens return 404.
 *
 * Rendering: server component → PublicPageView (no Tiptap bundle).
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { validateShareToken } from '@/lib/notion/share-token';
import PublicPageView from '@/components/notion/PublicPageView';

// TODO: Log share_link_access rows here once share_link_accesses table is
// added to schema (requires a schema migration — skipped per spec).

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const result = await validateShareToken(token);
  if (!result.valid) {
    return { title: 'Shared page not found — Slack-Notion' };
  }
  return {
    title: `${result.data.pageTitle} — Slack-Notion`,
    description: 'This page has been shared publicly via Slack-Notion.',
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;

  const result = await validateShareToken(token);
  if (!result.valid) {
    notFound();
  }

  const { page, pageTitle } = result.data;

  return (
    <PublicPageView pageId={page.id} title={pageTitle} />
  );
}
