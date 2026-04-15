'use client';

import { useState, useRef, useEffect } from 'react';
import type { FormulaConfig, PropertyDefinition } from '@notion/shared';
import { parseFormula } from '@notion/shared';
import { cn } from '@/lib/utils';

interface FormulaEditorProps {
  propertyId: string;
  formula?: FormulaConfig;
  properties: PropertyDefinition[];
  onSave: (config: FormulaConfig) => void;
  onClose: () => void;
}

// ---- Categorised built-in functions ----

interface FunctionHint {
  name: string;
  signature: string;
  category: 'Math' | 'String' | 'Date' | 'Logic';
}

const FUNCTION_HINTS: FunctionHint[] = [
  // Math
  { name: 'abs', signature: 'abs(number) → number', category: 'Math' },
  { name: 'ceil', signature: 'ceil(number) → number', category: 'Math' },
  { name: 'floor', signature: 'floor(number) → number', category: 'Math' },
  { name: 'round', signature: 'round(number) → number', category: 'Math' },
  { name: 'sqrt', signature: 'sqrt(number) → number', category: 'Math' },
  { name: 'pow', signature: 'pow(base, exp) → number', category: 'Math' },
  { name: 'min', signature: 'min(...numbers) → number', category: 'Math' },
  { name: 'max', signature: 'max(...numbers) → number', category: 'Math' },
  { name: 'sign', signature: 'sign(number) → number', category: 'Math' },
  // String
  { name: 'concat', signature: 'concat(...strings) → string', category: 'String' },
  { name: 'contains', signature: 'contains(text, sub) → boolean', category: 'String' },
  { name: 'length', signature: 'length(text) → number', category: 'String' },
  { name: 'replace', signature: 'replace(text, from, to) → string', category: 'String' },
  { name: 'replaceAll', signature: 'replaceAll(text, from, to) → string', category: 'String' },
  { name: 'lower', signature: 'lower(text) → string', category: 'String' },
  { name: 'upper', signature: 'upper(text) → string', category: 'String' },
  { name: 'trim', signature: 'trim(text) → string', category: 'String' },
  { name: 'slice', signature: 'slice(text, start, end?) → string', category: 'String' },
  { name: 'format', signature: 'format(value) → string', category: 'String' },
  // Date
  { name: 'now', signature: 'now() → date', category: 'Date' },
  { name: 'dateAdd', signature: 'dateAdd(date, n, unit) → date', category: 'Date' },
  { name: 'dateSubtract', signature: 'dateSubtract(date, n, unit) → date', category: 'Date' },
  { name: 'dateBetween', signature: 'dateBetween(date1, date2, unit) → number', category: 'Date' },
  { name: 'formatDate', signature: 'formatDate(date, format) → string', category: 'Date' },
  // Logic
  { name: 'if', signature: 'if(condition, ifTrue, ifFalse) → any', category: 'Logic' },
  { name: 'empty', signature: 'empty(value) → boolean', category: 'Logic' },
  { name: 'not', signature: 'not(value) → boolean', category: 'Logic' },
  { name: 'and', signature: 'and(a, b) → boolean', category: 'Logic' },
  { name: 'or', signature: 'or(a, b) → boolean', category: 'Logic' },
  { name: 'toNumber', signature: 'toNumber(value) → number', category: 'Logic' },
];

const CATEGORIES = ['Math', 'String', 'Date', 'Logic'] as const;

// ---- Autocomplete suggestion state ----

type SuggestionMode = 'none' | 'function' | 'property';

interface Suggestion {
  mode: SuggestionMode;
  items: string[];
  query: string;
}

function getSuggestions(text: string, properties: PropertyDefinition[]): Suggestion {
  // After "prop(" — suggest property names
  const propMatch = text.match(/prop\(["']([^"']*)$/);
  if (propMatch) {
    const query = propMatch[1] ?? '';
    const items = properties
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .map((p) => p.name);
    return { mode: 'property', items, query };
  }

  // After a letter prefix (not inside a string) — suggest functions
  const fnMatch = text.match(/([a-zA-Z][a-zA-Z0-9]*)$/);
  if (fnMatch) {
    const query = fnMatch[1] ?? '';
    const items = FUNCTION_HINTS
      .filter((f) => f.name.toLowerCase().startsWith(query.toLowerCase()))
      .map((f) => f.name);
    return { mode: 'function', items, query };
  }

  return { mode: 'none', items: [], query: '' };
}

export function FormulaEditor({
  formula,
  properties,
  onSave,
  onClose,
}: FormulaEditorProps) {
  const [expression, setExpression] = useState(formula?.expression ?? '');
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion>({ mode: 'none', items: [], query: '' });
  const [activeSuggIdx, setActiveSuggIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validate on every change
  useEffect(() => {
    if (!expression.trim()) {
      setError(null);
      return;
    }
    try {
      parseFormula(expression);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid formula');
    }
  }, [expression]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setExpression(val);

    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const sugg = getSuggestions(textBeforeCursor, properties);
    setSuggestion(sugg);
    setActiveSuggIdx(0);
  }

  function applySuggestion(item: string) {
    const cursor = textareaRef.current?.selectionStart ?? expression.length;
    const textBefore = expression.slice(0, cursor);
    const textAfter = expression.slice(cursor);

    let newText = expression;

    if (suggestion.mode === 'property') {
      // Replace from the last quote up to cursor
      const quoteIdx = textBefore.lastIndexOf('"') !== -1
        ? textBefore.lastIndexOf('"')
        : textBefore.lastIndexOf("'");
      const before = textBefore.slice(0, quoteIdx + 1);
      newText = before + item + '"' + ')' + textAfter;
    } else if (suggestion.mode === 'function') {
      // Replace the partial identifier
      const fnMatch = textBefore.match(/([a-zA-Z][a-zA-Z0-9]*)$/);
      const prefixLen = fnMatch?.[1]?.length ?? 0;
      const before = textBefore.slice(0, textBefore.length - prefixLen);
      newText = before + item + '(' + textAfter;
    }

    setExpression(newText);
    setSuggestion({ mode: 'none', items: [], query: '' });

    // Restore focus
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestion.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggIdx((i) => (i + 1) % suggestion.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggIdx((i) => (i - 1 + suggestion.items.length) % suggestion.items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = suggestion.items[activeSuggIdx];
        if (item) applySuggestion(item);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestion({ mode: 'none', items: [], query: '' });
        return;
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleSave() {
    if (!expression.trim()) return;
    if (error) return;
    onSave({ expression: expression.trim() });
  }

  const isValid = expression.trim().length > 0 && !error;

  return (
    <div className="p-3 w-[400px]">
      <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
        Formula
      </p>

      {/* Expression input */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={expression}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder='e.g. prop("Price") * prop("Quantity")'
          spellCheck={false}
          className={cn(
            'w-full resize-none rounded-[3px] px-2 py-1.5 text-sm outline-none',
            'bg-[var(--bg-hover)] text-[var(--text-primary)]',
            'focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]',
            'placeholder:text-[var(--text-tertiary)]',
          )}
          style={{
            fontFamily: 'SFMono-Regular, Menlo, Consolas, "Liberation Mono", Courier, monospace',
          }}
        />

        {/* Autocomplete dropdown */}
        {suggestion.items.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full mt-0.5 z-[30] rounded-[4px] overflow-hidden max-h-[160px] overflow-y-auto"
            style={{
              boxShadow:
                '0 0 0 1px rgba(15,15,15,0.05),0 3px 6px rgba(15,15,15,0.1),0_9px_24px_rgba(15,15,15,0.2)',
              background: 'var(--bg-default)',
            }}
          >
            {suggestion.items.map((item, idx) => (
              <button
                key={item}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(item);
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-sm',
                  idx === activeSuggIdx
                    ? 'bg-[var(--accent-blue)] text-white'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
                )}
              >
                {suggestion.mode === 'function' ? (
                  <span style={{ fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace' }}>
                    {FUNCTION_HINTS.find((f) => f.name === item)?.signature ?? item}
                  </span>
                ) : (
                  <span>prop("{item}")</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error / success feedback */}
      {error ? (
        <p className="mt-1.5 text-xs" style={{ color: '#eb5757' }}>
          {error}
        </p>
      ) : expression.trim() ? (
        <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">Formula is valid</p>
      ) : null}

      <div className="h-px bg-[var(--divider)] my-3" />

      {/* Function reference */}
      <div className="mb-3">
        <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
          Functions
        </p>
        {CATEGORIES.map((cat) => (
          <div key={cat} className="mb-1.5">
            <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-0.5">
              {cat}
            </p>
            <div className="flex flex-wrap gap-1">
              {FUNCTION_HINTS.filter((f) => f.category === cat).map((f) => (
                <button
                  key={f.name}
                  type="button"
                  title={f.signature}
                  onClick={() => {
                    const cursor = textareaRef.current?.selectionStart ?? expression.length;
                    const before = expression.slice(0, cursor);
                    const after = expression.slice(cursor);
                    setExpression(before + f.name + '(' + after);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                  className="px-1.5 py-0.5 rounded-[3px] text-[11px] bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--accent-blue)] hover:text-white transition-colors duration-[var(--duration-micro)]"
                  style={{ fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace' }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-[3px] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className={cn(
            'px-3 py-1.5 rounded-[3px] text-sm font-medium transition-colors duration-[var(--duration-micro)]',
            isValid
              ? 'bg-[var(--accent-blue)] text-white hover:opacity-90'
              : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] cursor-not-allowed',
          )}
        >
          Save
        </button>
      </div>
    </div>
  );
}
