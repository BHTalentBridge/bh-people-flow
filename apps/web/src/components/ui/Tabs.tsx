import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/** Underline slides between tabs via a shared layoutId — one clear focal move. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  idPrefix = 'tabs',
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  idPrefix?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative shrink-0 px-3 pt-1 pb-2.5 text-[13.5px] font-medium transition-colors duration-150',
              active
                ? 'text-[color:var(--text-primary)]'
                : 'text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={cn(
                    'tnum rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    active
                      ? 'bg-brand-600/12 text-brand-700 dark:text-brand-300'
                      : 'bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId={`${idPrefix}-underline`}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="bg-brand-600 absolute inset-x-1 -bottom-px h-0.5 rounded-full"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
