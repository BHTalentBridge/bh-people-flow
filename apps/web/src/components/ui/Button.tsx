import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/20 disabled:bg-brand-600/50',
  secondary:
    'border text-[color:var(--text-primary)] bg-[color:var(--surface-card)] hover:bg-[color:var(--surface-hover)] border-[color:var(--border-strong)]',
  subtle:
    'text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--border-subtle)]',
  ghost:
    'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-600/20',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm shadow-emerald-600/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center font-medium whitespace-nowrap select-none',
        // Fast, physical feedback on press — no bounce.
        'transition-[background-color,color,border-color,transform,opacity] duration-150 ease-[var(--ease-out-soft)]',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      {children}
    </button>
  );
});
