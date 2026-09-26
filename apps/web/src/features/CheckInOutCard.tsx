import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { LogIn, LogOut, Timer, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { fmtDuration, fmtTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { cn } from '@/lib/cn';
import type { Attendance } from '@/lib/types';

const STANDARD_MINUTES = 8 * 60;
const BREAK_MINUTES = 60;
/** No break deduction at or under 6h; mirrors breakFor() on the server. */
const BREAK_THRESHOLD_MINUTES = 6 * 60;
const breakFor = (elapsed: number) =>
  elapsed <= BREAK_THRESHOLD_MINUTES
    ? 0
    : Math.min(BREAK_MINUTES, elapsed - BREAK_THRESHOLD_MINUTES);

/**
 * The single most-used control in the product, so it gets prominent placement and
 * a live running total. Shown to every role — everyone clocks in.
 */
export function CheckInOutCard({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [otReason, setOtReason] = useState('');

  const { data: today, isLoading } = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: async () => (await api.get<Attendance | null>('/attendance/today')).data,
  });

  const open = !!today && !today.checkOutAt;

  // Tick only while the clock is actually running.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const checkIn = useMutation({
    mutationFn: () => api.post('/attendance/check-in', {}),
    onSuccess: () => {
      invalidate();
      toast.success('Checked in', { description: `Started at ${fmtTime(new Date())}` });
    },
    onError: toastError,
  });

  const checkOut = useMutation({
    mutationFn: () => api.post('/attendance/check-out', { otReason: otReason || undefined }),
    onSuccess: ({ data }: { data: Attendance }) => {
      invalidate();
      setOtReason('');
      if (data.otMinutes > 0) {
        toast.success(`Checked out — ${fmtDuration(data.workMinutes)} worked`, {
          description: `${fmtDuration(data.otMinutes)} overtime sent to your manager for approval.`,
        });
      } else {
        toast.success('Checked out', { description: `${fmtDuration(data.workMinutes)} worked today.` });
      }
    },
    onError: toastError,
  });

  // Live projection of what the shift will be worth if you clocked out now.
  const elapsedMin = today ? Math.max(0, Math.floor((now - new Date(today.checkInAt).getTime()) / 60000)) : 0;
  const liveBreak = breakFor(elapsedMin);
  const payable = Math.max(0, elapsedMin - liveBreak);
  const liveWork = Math.min(payable, STANDARD_MINUTES);
  const liveOt = Math.max(0, payable - STANDARD_MINUTES);
  const progress = Math.min(100, (payable / STANDARD_MINUTES) * 100);

  if (isLoading) {
    return <div className="surface h-[132px] animate-pulse rounded-[var(--radius-card)]" />;
  }

  return (
    <div className={cn('surface relative overflow-hidden rounded-[var(--radius-card)]', compact ? 'p-4' : 'p-5')}>
      <AnimatePresence mode="wait" initial={false}>
        {/* --- Not yet checked in --- */}
        {!today && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">Today</p>
              <p className="mt-1.5 text-[17px] font-semibold">Ready when you are</p>
              <p className="text-secondary mt-1 text-[13px]">
                Past 6h a 1-hour break is deducted; work past 8h is raised as overtime.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              loading={checkIn.isPending}
              onClick={() => checkIn.mutate()}
            >
              <LogIn className="h-4 w-4" /> Check in
            </Button>
          </motion.div>
        )}

        {/* --- On the clock --- */}
        {open && (
          <motion.div
            key="open"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">
                    On the clock
                  </p>
                </div>
                <p className="tnum mt-2 text-[30px] leading-none font-semibold">
                  {fmtDuration(elapsedMin)}
                </p>
                <p className="text-secondary mt-2 text-[13px]">
                  In at {fmtTime(today.checkInAt)} · {fmtDuration(liveWork)} work
                  {liveBreak > 0 && (
                    <span className="text-muted"> · {liveBreak}m break</span>
                  )}
                  {liveOt > 0 && (
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {' '}
                      + {fmtDuration(liveOt)} OT
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Button
                  variant={liveOt > 0 ? 'primary' : 'secondary'}
                  size="lg"
                  loading={checkOut.isPending}
                  onClick={() => checkOut.mutate()}
                >
                  <LogOut className="h-4 w-4" /> Check out
                </Button>
              </div>
            </div>

            {/* Progress toward the standard day; the bar turns amber once in OT. */}
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
                <motion.div
                  className={cn('h-full rounded-full', liveOt > 0 ? 'bg-amber-500' : 'bg-emerald-500')}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div className="text-muted mt-1.5 flex justify-between text-[11px]">
                <span>{fmtDuration(payable)} of 8h standard day</span>
                {liveOt > 0 && <span className="text-amber-600 dark:text-amber-400">Overtime accruing</span>}
              </div>
            </div>

            {liveOt > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <input
                  value={otReason}
                  onChange={(e) => setOtReason(e.target.value)}
                  placeholder="Reason for overtime (sent to your manager)"
                  className="mt-3 w-full rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-card)] px-3 py-2 text-[13px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* --- Day complete --- */}
        {today && today.checkOutAt && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-muted inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Day complete
              </p>
              <p className="tnum mt-2 text-[26px] leading-none font-semibold">
                {fmtDuration(today.workMinutes)}
              </p>
              <p className="text-secondary mt-2 text-[13px]">
                {fmtTime(today.checkInAt)} – {fmtTime(today.checkOutAt)}
                {today.breakMinutes > 0
                  ? ` · ${today.breakMinutes}m break deducted`
                  : ' · no break deducted'}
              </p>
            </div>

            {today.otMinutes > 0 && today.overtimeRequest && (
              <div className="text-right">
                <p className="text-muted inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
                  <Timer className="h-3.5 w-3.5" /> Overtime
                </p>
                <p className="tnum mt-1.5 text-[18px] font-semibold">{fmtDuration(today.otMinutes)}</p>
                <div className="mt-1.5">
                  <StatusPill status={today.overtimeRequest.status} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
