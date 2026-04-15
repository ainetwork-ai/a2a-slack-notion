'use client';

import { useState, useEffect, useRef } from 'react';

interface MermaidBlockProps {
  code: string;
  onChange?: (code: string) => void;
  editable?: boolean;
}

export function MermaidBlock({ code, onChange, editable = true }: MermaidBlockProps) {
  const [editing, setEditing] = useState(!code);
  const [value, setValue] = useState(code);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value || editing) return;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
        const id = `mermaid-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(id, value);
        setSvg(renderedSvg);
        setError('');
      } catch (e) {
        setError(String(e));
        setSvg('');
      }
    }
    render();
  }, [value, editing]);

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
          placeholder="graph TD\n  A-->B"
          className="w-full bg-transparent text-sm font-mono text-[var(--text-primary)] outline-none resize-none"
          rows={5}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={() => editable && setEditing(true)}
      className="my-2 cursor-pointer rounded-[var(--radius-md)] p-4 hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] flex justify-center"
    >
      {error ? (
        <p className="text-sm text-[var(--color-red)]">{error}</p>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Click to add diagram</p>
      )}
    </div>
  );
}
