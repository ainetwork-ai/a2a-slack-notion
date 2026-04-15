import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-[var(--radius-input)] bg-transparent px-3 py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-shadow duration-[var(--duration-micro)]',
          'shadow-[0_0_0_1px_var(--divider)]',
          'focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--accent-blue)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
