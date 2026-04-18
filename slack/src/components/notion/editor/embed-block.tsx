'use client';

import { useState } from 'react';

interface EmbedBlockProps {
  url: string;
  onChange?: (url: string) => void;
  editable?: boolean;
}

const EMBED_PATTERNS: { regex: RegExp; transform: (url: string) => string }[] = [
  {
    regex: /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    transform: (url) => {
      const id = url.match(/v=([a-zA-Z0-9_-]+)/)?.[1];
      return `https://www.youtube.com/embed/${id}`;
    },
  },
  {
    regex: /youtu\.be\/([a-zA-Z0-9_-]+)/,
    transform: (url) => {
      const id = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)?.[1];
      return `https://www.youtube.com/embed/${id}`;
    },
  },
  {
    regex: /figma\.com/,
    transform: (url) => `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(url)}`,
  },
  {
    regex: /codepen\.io/,
    transform: (url) => url.replace('/pen/', '/embed/'),
  },
];

function getEmbedUrl(url: string): string {
  for (const pattern of EMBED_PATTERNS) {
    if (pattern.regex.test(url)) {
      return pattern.transform(url);
    }
  }
  return url;
}

export function EmbedBlock({ url, onChange, editable = true }: EmbedBlockProps) {
  const [editing, setEditing] = useState(!url);
  const [value, setValue] = useState(url);

  if (editing && editable) {
    return (
      <div className="my-2 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] p-4">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setEditing(false);
              onChange?.(value);
            }
            if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          onBlur={() => {
            setEditing(false);
            onChange?.(value);
          }}
          placeholder="Paste URL (YouTube, Figma, CodePen, ...)"
          className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
          autoFocus
        />
      </div>
    );
  }

  if (!value) {
    return (
      <div
        onClick={() => editable && setEditing(true)}
        className="my-2 cursor-pointer rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] p-8 text-center text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
      >
        Click to add embed
      </div>
    );
  }

  const embedUrl = getEmbedUrl(value);

  return (
    <div
      onClick={() => editable && setEditing(true)}
      className="my-2 rounded-[var(--radius-md)] overflow-hidden"
    >
      <iframe
        src={embedUrl}
        className="w-full border-0"
        style={{ aspectRatio: '16/9', minHeight: '300px' }}
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
