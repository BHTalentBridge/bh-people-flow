import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * Tables are a first-class surface here — dense but readable, sortable, and they
 * scroll inside their own container so the page never scrolls sideways.
 */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('surface overflow-hidden rounded-[var(--radius-card)]', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>{children}</table>;
}

export function Th({
  children,
  sortKey,
  sortBy,
  sortDir,
  onSort,
  align = 'left',
  className,
}: {
  children?: ReactNode;
  sortKey?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  const active = sortKey && sortBy === sortKey;
  const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      className={cn(
        'text-muted sticky top-0 z-10 border-b bg-[color:var(--surface-card)] px-4 py-2.5',
        'text-[11px] font-semibold tracking-wider uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {sortKey && onSort ? (
        <button
          onClick={() => onSort(sortKey)}
          className={cn(
            'inline-flex items-center gap-1 transition-colors duration-150 hover:text-[color:var(--text-primary)]',
            active && 'text-[color:var(--text-primary)]',
            align === 'right' && 'flex-row-reverse',
          )}
        >
          {children}
          <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className,
  ...rest
}: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string } & Record<string, any>) {
  return (
    <td
      className={cn(
        'border-b px-4 py-3 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/** Rows fade in and collapse out, so deletes read as a row closing, not vanishing. */
export function Tr({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.tr
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={cn(
        'transition-colors duration-150 last:[&>td]:border-b-0',
        onClick && 'cursor-pointer',
        'hover:bg-[color:var(--surface-hover)]',
        className,
      )}
    >
      {children}
    </motion.tr>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p className="text-muted text-[13px]">
        <span className="tnum">
          {from}–{to}
        </span>{' '}
        of <span className="tnum">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-muted tnum px-2 text-[13px]">
          {page} / {pageCount}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
