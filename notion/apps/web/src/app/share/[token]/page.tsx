'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Globe, AlertCircle, FileText } from 'lucide-react';

interface SharedPage {
  object: string;
  accessLevel: 'can_view' | 'can_edit' | 'can_comment' | 'full_access';
  readOnly: boolean;
  page: {
    id: string;
    type: string;
    properties: {
      title: string;
      icon?: string;
    };
    content: unknown;
    children?: Array<{ id: string; type: string }>;
  };
}

type PageState = 'loading' | 'ready' | 'error' | 'expired';

function extractText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const node = content as { type?: string; text?: string; content?: unknown[] };
  if (node.text) return node.text;
  if (node.content) return node.content.map(extractText).join('\n');
  return '';
}

function ContentRenderer({ content }: { content: unknown }) {
  if (!content || typeof content !== 'object') return null;

  const node = content as {
    type?: string;
    text?: string;
    marks?: Array<{ type: string }>;
    content?: unknown[];
    attrs?: Record<string, unknown>;
  };

  if (node.type === 'doc') {
    return (
      <div className="space-y-1">
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </div>
    );
  }

  if (node.type === 'paragraph') {
    const text = node.content?.map(extractText).join('') ?? '';
    if (!text.trim()) return <div className="h-5" />;
    return (
      <p className="text-[var(--text-primary)] leading-7 text-[15px]">
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </p>
    );
  }

  if (node.type === 'heading') {
    const level = (node.attrs?.level as number) ?? 1;
    const className =
      level === 1
        ? 'text-[28px] font-bold text-[var(--text-primary)] mt-6 mb-1'
        : level === 2
          ? 'text-[22px] font-semibold text-[var(--text-primary)] mt-5 mb-1'
          : 'text-[18px] font-semibold text-[var(--text-primary)] mt-4 mb-1';
    return (
      <div className={className}>
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </div>
    );
  }

  if (node.type === 'bulletList') {
    return (
      <ul className="list-disc pl-6 space-y-1">
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </ul>
    );
  }

  if (node.type === 'orderedList') {
    return (
      <ol className="list-decimal pl-6 space-y-1">
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </ol>
    );
  }

  if (node.type === 'listItem') {
    return (
      <li className="text-[var(--text-primary)] text-[15px] leading-7">
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </li>
    );
  }

  if (node.type === 'blockquote') {
    return (
      <blockquote className="border-l-4 border-[var(--divider)] pl-4 text-[var(--text-secondary)] italic my-2">
        {node.content?.map((child, i) => (
          <ContentRenderer key={i} content={child} />
        ))}
      </blockquote>
    );
  }

  if (node.type === 'codeBlock') {
    const code = node.content?.map(extractText).join('') ?? '';
    return (
      <pre className="bg-[var(--bg-hover)] rounded-[var(--radius-md)] p-4 overflow-x-auto my-2">
        <code className="text-[13px] font-mono text-[var(--text-primary)]">{code}</code>
      </pre>
    );
  }

  if (node.type === 'horizontalRule') {
    return <hr className="border-t border-[var(--divider)] my-4" />;
  }

  if (node.type === 'text') {
    const isBold = node.marks?.some((m) => m.type === 'bold');
    const isItalic = node.marks?.some((m) => m.type === 'italic');
    const isCode = node.marks?.some((m) => m.type === 'code');
    const isStrike = node.marks?.some((m) => m.type === 'strike');

    let el: React.ReactNode = node.text ?? '';
    if (isCode) {
      el = (
        <code className="bg-[var(--bg-hover)] px-1 py-0.5 rounded text-[13px] font-mono text-[var(--text-primary)]">
          {el}
        </code>
      );
    } else {
      const classes = [
        isBold ? 'font-bold' : '',
        isItalic ? 'italic' : '',
        isStrike ? 'line-through' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (classes) {
        el = <span className={classes}>{el}</span>;
      }
    }
    return <>{el}</>;
  }

  // Fallback: extract raw text
  const raw = extractText(node);
  if (raw) return <p className="text-[var(--text-primary)] text-[15px] leading-7">{raw}</p>;
  return null;
}

export default function SharePage() {
  const params = useParams();
  const token = params['token'] as string;

  const [state, setState] = useState<PageState>('loading');
  const [data, setData] = useState<SharedPage | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const apiUrl =
    typeof window !== 'undefined'
      ? (process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`)
      : 'http://localhost:3011';

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/share/${token}`);
        if (res.status === 404) {
          setState('error');
          setErrorMsg('This page is not available or the link has been removed.');
          return;
        }
        if (res.status === 410) {
          setState('expired');
          return;
        }
        if (!res.ok) {
          setState('error');
          setErrorMsg('Failed to load page.');
          return;
        }
        const json = (await res.json()) as SharedPage;
        setData(json);
        setState('ready');
      } catch {
        setState('error');
        setErrorMsg('Failed to connect to the server.');
      }
    })();
  }, [token, apiUrl]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <div className="text-center max-w-[384px] px-4">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Link Expired</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            This shared link has expired. Please ask the page owner for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <div className="text-center max-w-[384px] px-4">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Page Not Found</h1>
          <p className="text-sm text-[var(--text-secondary)]">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { page } = data;
  const title = page.properties.title || 'Untitled';
  const icon = page.properties.icon;

  return (
    <div className="min-h-screen bg-[var(--bg-default)] flex flex-col">
      {/* Top banner */}
      <header className="sticky top-0 z-10 bg-[var(--bg-sidebar)] border-b border-[var(--divider)] px-4 h-[44px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--accent-blue)]" />
          <span className="text-sm font-medium text-[var(--text-secondary)]">Shared via Notion Clone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-hover)] text-[var(--text-tertiary)]">
            <FileText className="w-3 h-3" />
            Read only
          </span>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 mx-auto w-full max-w-[900px] px-4 md:px-24 py-12">
        {/* Icon */}
        {icon && <div className="text-[64px] leading-none mb-2">{icon}</div>}

        {/* Title */}
        <h1 className="text-[40px] font-bold leading-[1.2] text-[var(--text-primary)] mb-8">
          {title}
        </h1>

        {/* Content */}
        <div className="prose-none">
          <ContentRenderer content={page.content} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--divider)] py-6 text-center">
        <p className="text-xs text-[var(--text-tertiary)]">
          Powered by{' '}
          <span className="font-medium text-[var(--text-secondary)]">Notion Clone</span>
        </p>
      </footer>
    </div>
  );
}
