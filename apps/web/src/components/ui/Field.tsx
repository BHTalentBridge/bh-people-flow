import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-lg border bg-[color:var(--surface-card)] px-3 text-sm text-[color:var(--text-primary)] ' +
  'placeholder:text-[color:var(--text-muted)] border-[color:var(--border-strong)] ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function Label({ children, required, className }: { children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cn('text-secondary mb-1.5 block text-[13px] font-medium', className)}>
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <Label required={required}>{label}</Label>}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-muted mt-1.5 text-[12px]">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, 'h-9.5', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'min-h-20 py-2 leading-relaxed', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          CONTROL,
          'h-9.5 cursor-pointer appearance-none bg-no-repeat pr-8',
          "bg-[url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%238a90a0' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.6' d='m6 8 4 4 4-4'/%3e%3c/svg%3e\")]",
          'bg-[position:right_0.5rem_center] bg-[size:1.25rem]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
