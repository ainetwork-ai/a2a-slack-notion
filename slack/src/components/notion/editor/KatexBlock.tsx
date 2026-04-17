'use client';

import { useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface KatexBlockProps {
  formula: string;
  onChange?: (formula: string) => void;
  editable?: boolean;
}

export function KatexBlock({ formula, onChange, editable = true }: KatexBlockProps) {
  const [editing, setEditing] = useState(!formula);
  const [value, setValue] = useState(formula);

  let html = '';
  let error = '';
  try {
    html = katex.renderToString(value || '\\text{Click to add formula}', {
      throwOnError: false,
      displayMode: true,
    });
  } catch (e) {
    error = String(e);
  }

  if (editing && editable) {
    return (
      <div className="my-2 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] p-4">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onChange?.(value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditing(false);
              onChange?.(value);
            }
          }}
          placeholder="E = mc^2"
          className="w-full bg-transparent text-sm font-mono text-[var(--text-primary)] outline-none resize-none"
          rows={3}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => editable && setEditing(true)}
      className="my-2 cursor-pointer rounded-[var(--radius-md)] p-4 hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
    >
      {error ? (
        <p className="text-sm text-[var(--color-red)]">{error}</p>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
