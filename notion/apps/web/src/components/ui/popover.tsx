'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error('Popover components must be used within <Popover>');
  return ctx;
}

interface PopoverProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({ children, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (val: boolean) => {
      setInternalOpen(val);
      onOpenChange?.(val);
    },
    [onOpenChange],
  );

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  );
}

interface PopoverTriggerProps {
  children: ReactNode;
  asChild?: boolean;
  className?: string;
}

export function PopoverTrigger({ children, className }: PopoverTriggerProps) {
  const { open, setOpen, triggerRef } = usePopoverContext();

  return (
    <span
      ref={triggerRef as React.RefObject<HTMLSpanElement>}
      className={cn('inline-flex', className)}
      onClick={() => setOpen(!open)}
    >
      {children}
    </span>
  );
}

interface PopoverContentProps {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}

export function PopoverContent({
  children,
  className,
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
}: PopoverContentProps) {
  const { open, setOpen, triggerRef } = usePopoverContext();
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const content = contentRef.current;
      const contentW = content?.offsetWidth ?? 220;
      const contentH = content?.offsetHeight ?? 300;

      let top = 0;
      let left = 0;

      if (side === 'bottom') {
        top = rect.bottom + sideOffset + window.scrollY;
      } else if (side === 'top') {
        top = rect.top - contentH - sideOffset + window.scrollY;
      } else if (side === 'left') {
        top = rect.top + window.scrollY;
        left = rect.left - contentW - sideOffset;
        setPosition({ top, left });
        return;
      } else if (side === 'right') {
        top = rect.top + window.scrollY;
        left = rect.right + sideOffset;
        setPosition({ top, left });
        return;
      }

      if (align === 'start') {
        left = rect.left + window.scrollX;
      } else if (align === 'end') {
        left = rect.right - contentW + window.scrollX;
      } else {
        left = rect.left + rect.width / 2 - contentW / 2 + window.scrollX;
      }

      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - contentW - 8));

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, side, align, sideOffset, triggerRef]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen, triggerRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={contentRef}
      style={{ top: position.top, left: position.left, position: 'absolute' }}
      className={cn(
        'z-[60] min-w-[180px] rounded-[6px] bg-[var(--bg-default)]',
        'shadow-[0_0_0_1px_rgba(15,15,15,0.05),0_3px_6px_rgba(15,15,15,0.1),0_9px_24px_rgba(15,15,15,0.2)]',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
