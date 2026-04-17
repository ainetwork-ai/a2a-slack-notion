'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';

export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const emoji = (node.attrs['emoji'] as string) ?? '💡';

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        !pickerRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    updateAttributes({ emoji: emojiData.emoji });
    setShowEmojiPicker(false);
  };

  return (
    <NodeViewWrapper>
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: 16,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-hover)',
          margin: '4px 0',
          position: 'relative',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            ref={buttonRef}
            contentEditable={false}
            onClick={() => setShowEmojiPicker((v) => !v)}
            style={{
              width: 24,
              height: 24,
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              padding: 0,
              lineHeight: 1,
            }}
            title="Change emoji"
          >
            {emoji}
          </button>

          {showEmojiPicker && (
            <div
              ref={pickerRef}
              contentEditable={false}
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 20,
                boxShadow: 'var(--shadow-menu)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                width={320}
                height={400}
                searchPlaceholder="Search emoji..."
              />
            </div>
          )}
        </div>

        <NodeViewContent style={{ flex: 1, minWidth: 0 }} />
      </div>
    </NodeViewWrapper>
  );
}
