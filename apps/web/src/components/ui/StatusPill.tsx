import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { humanise } from '@/lib/format';

/**
 * Colour carries meaning here and nowhere else in the UI:
 * green = approved/done, amber = pending, red = rejected/overdue/blocked,
 * blue = in flight, neutral = draft/not started.
 */
const TONES = {
  neutral: 'bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] ring-[color:var(--border-subtle)]',
  green: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400',
  blue: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-400',
  violet: 'bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-400',
} as const;

export type Tone = keyof typeof TONES;

const STATUS_TONE: Record<string, Tone> = {
  // Approvals
  PENDING: 'amber', APPROVED: 'green', REJECTED: 'red',
  // Invoices
  DRAFT: 'neutral', SUBMITTED: 'amber',
  // Tasks
  TODO: 'neutral', IN_PROGRESS: 'blue', IN_REVIEW: 'violet', BLOCKED: 'red', DONE: 'green',
  // Priority
  LOW: 'neutral', MEDIUM: 'blue', HIGH: 'amber', URGENT: 'red',
  // Severity — how bad it is, deliberately the same colour language as priority
  S1: 'red', S2: 'amber', S3: 'blue', S4: 'neutral',
  // Projects
  PLANNING: 'blue', ACTIVE: 'green', ON_HOLD: 'amber', COMPLETED: 'neutral', ARCHIVED: 'neutral',
  // Resources
  INACTIVE: 'neutral', SH: 'blue', EXTERNAL: 'violet',
};

export function StatusPill({
  status,
  label,
  tone,
  dot = true,
  className,
  animateChange = true,
}: {
  status?: string | null;
  label?: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
  animateChange?: boolean;
}) {
  const resolved = tone ?? STATUS_TONE[status ?? ''] ?? 'neutral';
  const text = label ?? humanise(status);

  return (
    <motion.span
      // Re-keying on status lets the pill cross-fade when a record changes state.
      key={animateChange ? status : undefined}
      initial={animateChange ? { opacity: 0, scale: 0.94 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[resolved],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {text}
    </motion.span>
  );
}
