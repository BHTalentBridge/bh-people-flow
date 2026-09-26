import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { LogOut, Menu, Moon, Sun, ChevronDown, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationBell } from './NotificationBell';
import { humanise, ROLE_LABEL } from '@/lib/format';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-[color:var(--surface-card)]/85 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenu}
        aria-label="Open navigation"
        className="text-secondary -ml-1 rounded-lg p-2 transition-colors hover:bg-[color:var(--surface-hover)] lg:hidden"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-secondary truncate text-[13px]">
          <span className="font-medium text-[color:var(--text-primary)]">{user.name}</span>
          <span className="text-muted"> · {ROLE_LABEL[user.role]}</span>
          {user.company && <span className="text-muted"> · {user.company}</span>}
        </p>
      </div>

      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="text-secondary rounded-lg p-2 transition-colors duration-150 hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
      >
        {/* Enter-only keyed swap: the outgoing icon simply goes. Waiting for it
            to animate out could strand the incoming one invisible on a fast
            double-toggle. */}
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="block"
        >
          {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </motion.span>
      </button>

      <NotificationBell />

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          <Avatar name={user.name} color={user.avatarColor} size="sm" />
          <ChevronDown className="text-muted h-3.5 w-3.5" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.99 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="surface absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl shadow-xl shadow-slate-950/10"
              >
                <div className="border-b px-4 py-3">
                  <p className="truncate text-[13.5px] font-semibold">{user.name}</p>
                  <p className="text-muted truncate text-[12px]">{user.email}</p>
                  <p className="text-secondary mt-2 inline-flex items-center gap-1.5 text-[12px]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {ROLE_LABEL[user.role]}
                    {user.resourceType && ` · ${humanise(user.resourceType === 'SH' ? 'Internal' : 'External')}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-red-600 transition-colors hover:bg-red-500/8 dark:text-red-400"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
