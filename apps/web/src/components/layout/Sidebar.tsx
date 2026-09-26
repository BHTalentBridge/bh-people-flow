import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { navFor } from './nav';

export function Sidebar({
  open,
  onClose,
  badges = {},
}: {
  open: boolean;
  onClose: () => void;
  /** Pending-count per badge key, e.g. { approvals: 3, invoices: 2 }. */
  badges?: Partial<Record<'approvals' | 'invoices' | 'assignments' | 'leave', number>>;
}) {
  const { user } = useAuth();
  if (!user) return null;
  const items = navFor(user.role, {
    canInvoice: user.canInvoice,
    canApproveInvoices: user.canApproveInvoices,
  });

  return (
    <>
      {/* Scrim for the mobile drawer */}
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
        />
      )}

      <aside
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)' }}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r',
          'transition-transform duration-250 ease-[var(--ease-out-soft)] lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand-600 flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold text-white shadow-lg shadow-brand-600/25">
              SH
            </div>
            <div className="leading-tight">
              <p className="text-[14px] font-semibold text-white">PeopleFlow</p>
              <p className="text-[10.5px] tracking-wide" style={{ color: 'var(--nav-text)' }}>
                Project → Module → Resource
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {items.map((item) => (
            <NavLink
              key={`${item.to}-${item.label}`}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium',
                  'transition-colors duration-150',
                  isActive ? 'text-white' : 'hover:bg-white/[0.055]',
                )
              }
              style={({ isActive }) => ({ color: isActive ? 'var(--nav-text-active)' : 'var(--nav-text)' })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 rounded-lg"
                      style={{ background: 'var(--nav-active-bg)' }}
                    />
                  )}
                  <item.icon
                    className={cn('relative h-4 w-4 shrink-0', isActive ? 'opacity-100' : 'opacity-70')}
                    strokeWidth={1.9}
                  />
                  <span className="relative flex-1 truncate">{item.label}</span>
                  {item.badge && (badges[item.badge] ?? 0) > 0 && (
                    <span className="tnum relative rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-300">
                      {badges[item.badge]}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--nav-border)' }}>
          <p className="text-[10.5px]" style={{ color: 'var(--nav-text)' }}>
            Steel Horizon HRMS
          </p>
        </div>
      </aside>
    </>
  );
}
