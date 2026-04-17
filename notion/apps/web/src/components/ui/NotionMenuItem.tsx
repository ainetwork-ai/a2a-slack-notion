import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface NotionMenuItemProps {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function NotionMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  className,
  danger = false,
  disabled = false,
}: NotionMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "notion-hover flex w-full items-center gap-2 px-2 h-7 text-left text-sm",
        danger
          ? "text-[var(--color-red)] hover:bg-[rgba(235,87,87,0.08)]"
          : "text-[var(--text-primary)]",
        disabled && "opacity-40 pointer-events-none",
        className
      )}
    >
      {icon && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-secondary)]">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          {shortcut}
        </span>
      )}
    </button>
  );
}
