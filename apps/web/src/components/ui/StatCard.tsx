import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { itemVariants } from '@/lib/motion';

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'amber' | 'red' | 'green';
  onClick?: () => void;
}) {
  const toneRing = {
    neutral: '',
    amber: 'ring-1 ring-amber-500/20',
    red: 'ring-1 ring-red-500/20',
    green: 'ring-1 ring-emerald-500/20',
  }[tone];

  const iconTone = {
    neutral: 'text-[color:var(--text-muted)] bg-[color:var(--surface-sunken)]',
    amber: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
    red: 'text-red-600 bg-red-500/10 dark:text-red-400',
    green: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  }[tone];

  const Comp = onClick ? motion.button : motion.div;

  return (
    <Comp
      variants={itemVariants}
      whileHover={onClick ? { y: -2 } : undefined}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={cn(
        'surface rounded-[var(--radius-card)] px-4 py-3.5 text-left',
        'shadow-[0_1px_2px_rgba(16,20,28,0.04)]',
        toneRing,
        onClick && 'cursor-pointer transition-colors hover:bg-[color:var(--surface-hover)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">{label}</p>
          <p className="tnum mt-1.5 text-[26px] leading-none font-semibold">{value}</p>
          {sub && <p className="text-secondary mt-2 text-[12.5px]">{sub}</p>}
        </div>
        {Icon && (
          <span className={cn('rounded-lg p-2', iconTone)}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
        )}
      </div>
    </Comp>
  );
}
