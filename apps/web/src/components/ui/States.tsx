import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      {Icon && (
        <div className="text-muted mb-3.5 rounded-xl bg-[color:var(--surface-sunken)] p-3">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
      )}
      <p className="text-[15px] font-medium">{title}</p>
      {description && (
        <p className="text-secondary mt-1.5 max-w-sm text-[13px] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[color:var(--surface-sunken)]', className)}
      aria-hidden
    />
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="surface rounded-[var(--radius-card)] p-4">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn('h-4 flex-1', c === 0 && 'max-w-[28%]', c === cols - 1 && 'max-w-[12%]')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface rounded-[var(--radius-card)] p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-14" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="surface rounded-[var(--radius-card)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-secondary mt-3 text-[13px] underline underline-offset-4 hover:text-[color:var(--text-primary)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
