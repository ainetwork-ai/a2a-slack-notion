import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 rounded-[var(--radius-sm)]',
        ghost:
          'hover:bg-[var(--bg-hover)] rounded-[var(--radius-sm)]',
        outline:
          'bg-transparent shadow-[0_0_0_1px_var(--divider)] hover:bg-[var(--bg-hover)] rounded-[var(--radius-sm)]',
        link: 'text-[var(--accent-blue)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
