import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Notification } from '@/lib/types';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<Notification[]>('/notifications')).data,
    refetchInterval: 60_000,
  });

  const unread = data.filter((n) => !n.readAt);

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const open1 = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="text-secondary relative rounded-lg p-2 transition-colors duration-150 hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
      >
        <Bell className="h-4.5 w-4.5" strokeWidth={1.9} />
        {unread.length > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="tnum absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
          >
            {unread.length > 9 ? '9+' : unread.length}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="surface absolute right-0 z-50 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl shadow-xl shadow-slate-950/10"
            >
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <p className="text-[13px] font-semibold">Notifications</p>
                {unread.length > 0 && (
                  <button
                    onClick={() => markAll.mutate()}
                    className="text-muted inline-flex items-center gap-1 text-[12px] transition-colors hover:text-[color:var(--text-primary)]"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-[380px] overflow-y-auto">
                {data.length === 0 ? (
                  <p className="text-muted px-4 py-10 text-center text-[13px]">You're all caught up.</p>
                ) : (
                  data.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.readAt) open1.mutate(n.id);
                        setOpen(false);
                        if (n.link) navigate(n.link);
                      }}
                      className={cn(
                        'block w-full border-b px-4 py-3 text-left transition-colors duration-150 last:border-b-0',
                        'hover:bg-[color:var(--surface-hover)]',
                        !n.readAt && 'bg-brand-500/[0.045]',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        {!n.readAt && <span className="bg-brand-500 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />}
                        <div className={cn('min-w-0', n.readAt && 'pl-4')}>
                          <p className="truncate text-[13px] font-medium">{n.title}</p>
                          {n.body && <p className="text-secondary mt-0.5 line-clamp-2 text-[12.5px]">{n.body}</p>}
                          <p className="text-muted mt-1 text-[11px]">{fmtRelative(n.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
