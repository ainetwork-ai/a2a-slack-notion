/**
 * PublicPageView — server-side read-only block renderer for public share links.
 *
 * Renders the block tree as plain React nodes (no Tiptap, no editor bundle).
 * Block-to-React serialization follows the same structure as Agent AA's export
 * pipeline but targets React nodes instead of markdown strings.
 */

import { db } from '@/lib/db';
import { blocks, type BlockType, type BlockRow } from '@/lib/notion/share-token';
import { eq } from 'drizzle-orm';
import Link from 'next/link';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface BlockTree extends BlockRow {
  children: BlockTree[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Tree builder
// ──────────────────────────────────────────────────────────────────────────────

function buildTree(allBlocks: BlockRow[], rootId: string): BlockTree[] {
  const map = new Map<string, BlockTree>();
  for (const b of allBlocks) {
    map.set(b.id, { ...b, children: [] });
  }

  const root = map.get(rootId);
  if (!root) return [];

  const childrenOrder: string[] = Array.isArray(root.childrenOrder)
    ? (root.childrenOrder as string[])
    : [];

  return childrenOrder
    .map((id) => resolveNode(map, id))
    .filter((n): n is BlockTree => n !== null);
}

function resolveNode(map: Map<string, BlockTree>, id: string): BlockTree | null {
  const node = map.get(id);
  if (!node) return null;
  const order: string[] = Array.isArray(node.childrenOrder)
    ? (node.childrenOrder as string[])
    : [];
  node.children = order
    .map((cid) => resolveNode(map, cid))
    .filter((n): n is BlockTree => n !== null);
  return node;
}

// ──────────────────────────────────────────────────────────────────────────────
// Block serializer — block row → React node
// ──────────────────────────────────────────────────────────────────────────────

function blockText(block: BlockRow): string {
  const content = block.content as Record<string, unknown>;
  if (typeof content?.text === 'string') return content.text;
  if (Array.isArray(content?.text)) {
    return (content.text as Array<{ text?: string; plain_text?: string }>)
      .map((t) => t.plain_text ?? t.text ?? '')
      .join('');
  }
  const props = block.properties as Record<string, unknown>;
  if (typeof props?.title === 'string') return props.title;
  return '';
}

function RenderBlock({ block }: { block: BlockTree }): React.ReactNode {
  const type = block.type as BlockType;
  const text = blockText(block);
  const children = block.children.map((c) => (
    <RenderBlock key={c.id} block={c} />
  ));

  switch (type) {
    case 'heading_1':
      return <h1 className="text-3xl font-bold mt-8 mb-3 text-white">{text}</h1>;
    case 'heading_2':
      return <h2 className="text-2xl font-semibold mt-6 mb-2 text-white">{text}</h2>;
    case 'heading_3':
      return <h3 className="text-xl font-semibold mt-5 mb-2 text-slate-200">{text}</h3>;
    case 'text':
      return (
        <p className="text-slate-300 leading-relaxed mb-2">
          {text || <span className="opacity-0">&#8203;</span>}
        </p>
      );
    case 'quote':
      return (
        <blockquote className="border-l-4 border-slate-500 pl-4 italic text-slate-400 my-3">
          {text}
          {children}
        </blockquote>
      );
    case 'callout': {
      const props = block.properties as Record<string, unknown>;
      const icon = typeof props?.icon === 'string' ? props.icon : 'ℹ️';
      return (
        <div className="flex gap-3 bg-white/5 rounded-lg px-4 py-3 my-3">
          <span className="shrink-0 text-lg">{icon}</span>
          <div className="text-slate-300">{text}</div>
        </div>
      );
    }
    case 'bulleted_list':
      return (
        <ul className="list-disc list-inside text-slate-300 mb-1 ml-4">
          <li>{text}{children.length > 0 && <div className="ml-4">{children}</div>}</li>
        </ul>
      );
    case 'numbered_list':
      return (
        <ol className="list-decimal list-inside text-slate-300 mb-1 ml-4">
          <li>{text}{children.length > 0 && <div className="ml-4">{children}</div>}</li>
        </ol>
      );
    case 'to_do': {
      const props = block.properties as Record<string, unknown>;
      const checked = props?.checked === true;
      return (
        <div className="flex items-start gap-2 text-slate-300 mb-1">
          <span className="mt-0.5 text-sm">{checked ? '☑' : '☐'}</span>
          <span className={checked ? 'line-through text-slate-500' : ''}>{text}</span>
        </div>
      );
    }
    case 'toggle':
      return (
        <details className="text-slate-300 mb-2">
          <summary className="cursor-default select-none font-medium">{text}</summary>
          <div className="ml-4 mt-1">{children}</div>
        </details>
      );
    case 'code': {
      const props = block.properties as Record<string, unknown>;
      const lang = typeof props?.language === 'string' ? props.language : '';
      return (
        <pre className="bg-[#111] rounded-lg px-4 py-3 my-3 overflow-x-auto text-sm text-emerald-300 font-mono">
          <code data-language={lang}>{text}</code>
        </pre>
      );
    }
    case 'divider':
      return <hr className="border-white/10 my-5" />;
    case 'image': {
      const content = block.content as Record<string, unknown>;
      const src = typeof content?.url === 'string' ? content.url : '';
      const caption = typeof content?.caption === 'string' ? content.caption : '';
      if (!src) return null;
      return (
        <figure className="my-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={caption} className="max-w-full rounded-lg" />
          {caption && <figcaption className="text-center text-sm text-slate-500 mt-2">{caption}</figcaption>}
        </figure>
      );
    }
    case 'bookmark': {
      const content = block.content as Record<string, unknown>;
      const url = typeof content?.url === 'string' ? content.url : '';
      const title = typeof content?.title === 'string' ? content.title : url;
      if (!url) return null;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border border-white/10 rounded-lg px-4 py-3 my-3 text-blue-400 hover:bg-white/5 transition-colors truncate"
        >
          {title}
        </a>
      );
    }
    case 'page':
      // Nested page block — render as a link, don't recurse into full content
      return (
        <div className="border border-white/10 rounded-lg px-4 py-3 my-3 text-slate-400">
          <span className="text-slate-500 text-sm">Linked page: </span>
          <span>{text || 'Untitled'}</span>
        </div>
      );
    default:
      // Unknown / unsupported block types: render text content if any
      if (text) {
        return <p className="text-slate-300 mb-2">{text}</p>;
      }
      if (children.length > 0) {
        return <div>{children}</div>;
      }
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component (server component)
// ──────────────────────────────────────────────────────────────────────────────

interface PublicPageViewProps {
  pageId: string;
  /** Page title (already resolved by the parent route) */
  title: string;
}

export default async function PublicPageView({ pageId, title }: PublicPageViewProps) {
  const allBlocks = await db
    .select()
    .from(blocks)
    .where(eq(blocks.pageId, pageId));

  const tree = buildTree(allBlocks, pageId);

  return (
    <article className="max-w-[880px] mx-auto px-6 py-10 md:px-12">
      <h1 className="text-4xl font-bold text-white mb-8 leading-tight">{title}</h1>

      {tree.length === 0 ? (
        <p className="text-slate-500 italic">This page has no content.</p>
      ) : (
        <div className="space-y-1">
          {tree.map((block) => (
            <RenderBlock key={block.id} block={block} />
          ))}
        </div>
      )}

      {/* Watermark footer */}
      <footer className="mt-16 pt-6 border-t border-white/10 text-center text-sm text-slate-600">
        Shared via Slack-Notion &middot;{' '}
        <Link
          href={`/pages/${pageId}`}
          className="text-slate-500 hover:text-slate-400 underline"
        >
          opens in full app &rarr;
        </Link>
      </footer>
    </article>
  );
}
