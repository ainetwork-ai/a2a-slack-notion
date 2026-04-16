import { cn } from '@/lib/utils';
import type { PropertyColor } from '@notion/shared';

const colorMap: Record<PropertyColor, { bg: string; text: string }> = {
  default: { bg: '#e3e2e0', text: '#37352f' },
  gray: { bg: '#e3e2e0', text: '#787774' },
  brown: { bg: '#eee0da', text: '#9f6b53' },
  orange: { bg: '#fbecdd', text: '#d9730d' },
  yellow: { bg: '#fbf3db', text: '#cb912f' },
  green: { bg: '#edf3ec', text: '#448361' },
  blue: { bg: '#e7f3f8', text: '#337ea9' },
  purple: { bg: '#f4f0f7', text: '#9065b0' },
  pink: { bg: '#f5e0e9', text: '#c14c8a' },
  red: { bg: '#fdebed', text: '#eb5757' },
};

interface BadgeProps {
  label: string;
  color?: PropertyColor;
  className?: string;
  onRemove?: () => void;
}

export function Badge({ label, color = 'default', className, onRemove }: BadgeProps) {
  const { bg, text } = colorMap[color] ?? colorMap.default;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-xs font-medium leading-[1.4] max-w-full',
        className,
      )}
      style={{ backgroundColor: bg, color: text }}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-60 hover:opacity-100 leading-none"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}

export { colorMap };
export type { BadgeProps };
