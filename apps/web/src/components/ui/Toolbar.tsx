import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Input } from './Field';

/**
 * Search stays visible; the rest of the filters hide behind "Filters" so the
 * default view stays calm. The trigger shows how many filters are active.
 */
export function Toolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters,
  activeCount = 0,
  onClear,
  actions,
  alwaysOpen = false,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  actions?: ReactNode;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {onSearch && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => onSearch('')}
                aria-label="Clear search"
                className="text-muted absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 hover:text-[color:var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {filters && !alwaysOpen && (
          <Button
            variant={activeCount > 0 ? 'secondary' : 'ghost'}
            onClick={() => setOpen((o) => !o)}
            className={cn(activeCount > 0 && 'border-brand-500/40')}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeCount > 0 && (
              <span className="bg-brand-600 tnum ml-0.5 rounded-full px-1.5 text-[11px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </Button>
        )}

        {activeCount > 0 && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted">
            Clear all
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>

      <AnimatePresence initial={false}>
        {filters && open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid gap-3 rounded-xl border bg-[color:var(--surface-card)] p-3 sm:grid-cols-2 lg:grid-cols-4">
              {filters}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
