'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutRow[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: [mod, 'K'], description: 'Search messages, channels & people' },
      { keys: [mod, '⇧', 'K'], description: 'Open DM quick switcher' },
      { keys: [mod, '['], description: 'Navigate back' },
      { keys: [mod, ']'], description: 'Navigate forward' },
      { keys: [mod, '⇧', 'A'], description: 'Go to All DMs' },
      { keys: [mod, '⇧', 'T'], description: 'Close thread panel' },
    ],
  },
  {
    title: 'Panels & Modals',
    shortcuts: [
      { keys: [mod, '/'], description: 'Show keyboard shortcuts' },
      { keys: [mod, '⇧', 'M'], description: 'Toggle notifications panel' },
      { keys: ['Esc'], description: 'Close open panel or modal' },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-white/10 border border-white/20 text-slate-200 text-[11px] font-mono font-medium leading-none">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsModal() {
  const { shortcutsModalOpen, setShortcutsModalOpen } = useAppStore();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && shortcutsModalOpen) {
        setShortcutsModalOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shortcutsModalOpen, setShortcutsModalOpen]);

  if (!shortcutsModalOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        onClick={() => setShortcutsModalOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 top-[10%] z-50 mx-auto w-full max-w-xl">
        <div className="bg-[#1a1d21] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold text-base">Keyboard Shortcuts</h2>
            <button
              onClick={() => setShortcutsModalOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-slack">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  {section.title}
                </h3>
                <div className="space-y-2">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-sm text-slate-300">{shortcut.description}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {shortcut.keys.map((key, i) => (
                          <Kbd key={i}>{key}</Kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-5 py-3 border-t border-white/10">
            <p className="text-[11px] text-slate-600 text-center">
              Press <Kbd>Esc</Kbd> or click outside to close
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
