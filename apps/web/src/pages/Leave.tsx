import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarOff, CalendarPlus, CalendarCheck2, Clock3, Plane, Trash2, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, extractMessage, toastError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { countLeaveDays, fmtDate, fmtDateRange, fmtRelative, LEAVE_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Tabs } from '@/components/ui/Tabs';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { ApprovalActions } from '@/features/ApprovalActions';
import { cn } from '@/lib/cn';
import { listVariants } from '@/lib/motion';
import type { LeaveRequest, LeaveSummary, LeaveType } from '@/lib/types';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const TABS: { value: Tab; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

const TYPES: LeaveType[] = ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'OTHER'];

/** Annual reads calm, unpaid reads like a cost, sick is neutral-clinical. */
const TYPE_TONE: Record<LeaveType, 'blue' | 'amber' | 'violet' | 'neutral'> = {
  ANNUAL: 'blue',
  SICK: 'violet',
  CASUAL: 'neutral',
  UNPAID: 'amber',
  OTHER: 'neutral',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Leave.
 *
 * One screen, three audiences, and the difference is what they can *do* rather
 * than what they see:
 *
 *  - a **resource** books time off and tracks their own requests (`/my-leave`)
 *  - an **EM** or **Admin** decides the ones on their people
 *  - a **PM** reads the same rows — who's away is planning information, even
 *    though the decision isn't theirs
 *
 * Every row carries `canDecide` / `canWithdraw` from the server, so the page
 * never renders an action the API would reject.
 */
export default function Leave() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { state, set } = useQueryState({ status: 'PENDING' });
  const [search, setSearch] = useState(state.search ?? '');
  const debounced = useDebounced(search);
  const [formOpen, setFormOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<LeaveRequest | null>(null);

  const isResource = user?.role === 'RESOURCE';
  const canDecideAny = user?.role === 'ADMIN' || user?.role === 'EM';
  const tab = (state.status || 'PENDING') as Tab;

  const query = clean({
    status: tab === 'ALL' ? undefined : tab,
    type: state.type,
    from: state.from,
    to: state.to,
    search: debounced || undefined,
    page: Number(state.page ?? 1),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['leave', query],
    queryFn: async () => (await api.get<Paginated<LeaveRequest>>('/leave', { params: query })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const { data: summary, isPending: summaryPending } = useQuery({
    queryKey: ['leave-summary'],
    queryFn: async () => (await api.get<LeaveSummary>('/leave/summary')).data,
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => api.delete(`/leave/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['leave-summary'] });
      qc.invalidateQueries({ queryKey: ['leave-pending-count'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setWithdrawing(null);
      toast.success('Leave request withdrawn');
    },
    onError: (e) => { toastError(e); setWithdrawing(null); },
  });

  const rows = data?.items ?? [];
  const activeFilters = ['type', 'from', 'to'].filter((k) => state[k]).length;

  return (
    <>
      <PageHeader
        title={isResource ? 'My leave' : 'Leave'}
        description={
          isResource
            ? 'Book time off and track where each request stands. Your Engineering Manager or an Admin decides them.'
            : canDecideAny
              ? "Time off raised by resources. Approve or reject the ones on your people — either your decision or an Admin's settles it."
              : "Time off across your projects. Decisions rest with the Engineering Manager or an Admin, so this view is read-only."
        }
        actions={
          isResource ? (
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Request leave
            </Button>
          ) : undefined
        }
      />

      {/* Rendered whether or not the figures have arrived, so the page doesn't
          jump down when they do. */}
      {summaryPending ? (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {['Pending', 'Days taken', 'Approved', 'Away next'].map((label) => (
            <StatCard key={label} label={label} value="—" sub="Loading…" />
          ))}
        </div>
      ) : summary ? (
        <motion.div
          variants={listVariants}
          initial="initial"
          animate="animate"
          className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatCard
            label="Pending"
            value={summary.byStatus.PENDING.count}
            sub={`${summary.byStatus.PENDING.days} day${summary.byStatus.PENDING.days === 1 ? '' : 's'} awaiting a decision`}
            icon={Clock3}
            tone={summary.byStatus.PENDING.count ? 'amber' : 'neutral'}
            onClick={() => set({ status: 'PENDING' })}
          />
          <StatCard
            label={isResource ? 'Days taken' : 'Days taken'}
            value={summary.daysTakenThisYear}
            sub={`Approved in ${summary.year}`}
            icon={CalendarCheck2}
            tone="green"
            onClick={() => set({ status: 'APPROVED' })}
          />
          <StatCard
            label="Approved"
            value={summary.byStatus.APPROVED.count}
            sub={`${summary.byStatus.REJECTED.count} rejected`}
            icon={CalendarOff}
          />
          <StatCard
            label="Away next"
            value={summary.upcoming.length}
            sub={
              summary.upcoming.length
                ? `${summary.upcoming[0].resource.name} from ${fmtDate(summary.upcoming[0].startDate, 'd MMM')}`
                : 'Nobody scheduled'
            }
            icon={Plane}
          />
        </motion.div>
      ) : null}

      {/* Who's away next. Useful to a PM planning a sprint, and to a resource
          checking their own upcoming time off, so everyone sees it. */}
      {!!summary?.upcoming.length && (
        <Card className="mb-5">
          <CardHeader
            title="Upcoming approved leave"
            description={isResource ? 'Your next booked time off.' : 'Who is away, soonest first.'}
          />
          <CardBody className="pt-0">
            <ul className="flex flex-wrap gap-2">
              {summary.upcoming.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
                >
                  <Avatar name={l.resource.name} color={l.resource.user?.avatarColor} size="xs" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{l.resource.name}</p>
                    <p className="text-muted mt-0.5 text-[11.5px]">
                      {fmtDateRange(l.startDate, l.endDate)} · {l.days}d · {LEAVE_LABEL[l.type]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(v) => set({ status: v })}
        className="mb-4"
        idPrefix="leave"
      />

      <Toolbar
        search={search}
        onSearch={(v) => { setSearch(v); set({ search: v || undefined }); }}
        searchPlaceholder={isResource ? 'Search your reasons…' : 'Search by person, code or reason…'}
        activeCount={activeFilters}
        onClear={() => set({ type: undefined, from: undefined, to: undefined })}
        filters={
          <>
            <Field label="Type">
              <Select value={state.type ?? ''} onChange={(e) => set({ type: e.target.value || undefined })}>
                <option value="">All types</option>
                {TYPES.map((t) => <option key={t} value={t}>{LEAVE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Overlapping from" hint="Matches any leave touching the window.">
              <Input type="date" value={state.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
            </Field>
            <Field label="Overlapping to">
              <Input type="date" value={state.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
            </Field>
          </>
        }
      />

      {isError ? (
        <ErrorState message={extractMessage(error)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableShell><TableSkeleton rows={6} cols={6} /></TableShell>
      ) : !rows.length ? (
        <TableShell>
          <EmptyState
            icon={CalendarOff}
            title={
              tab === 'PENDING'
                ? isResource ? 'No requests in flight' : canDecideAny ? 'Nothing waiting on you' : 'Nothing pending'
                : `No ${tab.toLowerCase()} leave`
            }
            description={
              tab === 'PENDING'
                ? isResource
                  ? 'Book time off and it appears here while your Engineering Manager or an Admin decides.'
                  : canDecideAny
                    ? 'When someone on your projects books time off, it lands here for your decision.'
                    : 'Nobody on your projects has leave awaiting a decision.'
                : 'Nothing has reached this state yet.'
            }
            action={
              isResource && tab === 'PENDING' ? (
                <Button variant="primary" onClick={() => setFormOpen(true)}>
                  <CalendarPlus className="h-4 w-4" /> Request leave
                </Button>
              ) : undefined
            }
          />
        </TableShell>
      ) : (
        <TableShell>
          <Table className="min-w-[920px]">
            <thead>
              <tr>
                {!isResource && <Th>Person</Th>}
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th align="right">Days</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((l) => (
                  <Tr key={l.id}>
                    {!isResource && (
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={l.resource.name} color={l.resource.user?.avatarColor} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-medium">{l.resource.name}</p>
                            <p className="text-muted mt-0.5 truncate text-[12px]">
                              {l.resource.employeeCode}
                              {l.resource.designation ? ` · ${l.resource.designation}` : ''}
                            </p>
                          </div>
                        </div>
                      </Td>
                    )}
                    <Td>
                      <StatusPill
                        tone={TYPE_TONE[l.type]}
                        label={LEAVE_LABEL[l.type]}
                        dot={false}
                        animateChange={false}
                      />
                    </Td>
                    <Td>
                      <p className="text-[13.5px]">{fmtDateRange(l.startDate, l.endDate)}</p>
                      <p className="text-muted mt-0.5 text-[12px]">asked {fmtRelative(l.createdAt)}</p>
                    </Td>
                    <Td align="right" className="tnum text-[13.5px]">{l.days}</Td>
                    <Td>
                      <p className="text-secondary max-w-[28ch] truncate text-[12.5px]" title={l.reason ?? ''}>
                        {l.reason || '—'}
                      </p>
                    </Td>
                    <Td>
                      <StatusPill status={l.status} />
                      {l.decidedBy && (
                        <p className="text-muted mt-1 text-[12px]">
                          by {l.decidedBy.name} · {fmtDate(l.decidedAt, 'd MMM')}
                        </p>
                      )}
                      {l.decisionNote && (
                        <p className="text-secondary mt-1 max-w-[26ch] text-[12px] leading-snug">
                          “{l.decisionNote}”
                        </p>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        {l.canDecide && <ApprovalActions kind="leave" id={l.id} />}
                        {l.canWithdraw && !l.canDecide && (
                          <Button size="sm" variant="ghost" onClick={() => setWithdrawing(l)}>
                            <Trash2 className="h-3.5 w-3.5" /> Withdraw
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </AnimatePresence>
            </tbody>
          </Table>
          <Pagination
            page={data!.page}
            pageCount={data!.pageCount}
            total={data!.total}
            pageSize={data!.pageSize}
            onPage={(p) => set({ page: p })}
          />
        </TableShell>
      )}

      <LeaveFormModal open={formOpen} onClose={() => setFormOpen(false)} />

      <Modal
        open={!!withdrawing}
        onClose={() => setWithdrawing(null)}
        title="Withdraw this leave request?"
        description="It leaves the approver's queue and the dates free up. You can book them again later."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdrawing(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={withdraw.isPending}
              onClick={() => withdrawing && withdraw.mutate(withdrawing.id)}
            >
              <Trash2 className="h-4 w-4" /> Withdraw
            </Button>
          </>
        }
      >
        {withdrawing && (
          <div className="flex items-center gap-3 rounded-xl bg-[color:var(--surface-sunken)] px-3.5 py-3">
            <CalendarOff className="text-muted h-4 w-4 shrink-0" />
            <div className="min-w-0 text-[13px]">
              <p className="font-medium">
                {fmtDateRange(withdrawing.startDate, withdrawing.endDate)} · {withdrawing.days} day
                {withdrawing.days === 1 ? '' : 's'}
              </p>
              <p className="text-muted mt-0.5">
                {LEAVE_LABEL[withdrawing.type]} leave
                {withdrawing.reason ? ` · “${withdrawing.reason}”` : ''}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ==========================================================================
   Booking it. Only a resource ever opens this.
   ========================================================================== */
function LeaveFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: 'ANNUAL' as LeaveType, startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
  }, [open]);

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      // Picking a start after the current end is a correction, not a mistake —
      // carry the end along rather than making them fix an invalid range.
      if (patch.startDate && (!next.endDate || next.endDate < patch.startDate)) {
        next.endDate = patch.startDate;
      }
      return next;
    });

  // Previews the server's own count, so nobody submits blind. The API recomputes it.
  const days = useMemo(() => countLeaveDays(form.startDate, form.endDate), [form.startDate, form.endDate]);
  const allWeekend = !!form.startDate && !!form.endDate && days === 0;
  const backdated = !!form.startDate && form.startDate < todayISO();
  const reasonRequired = form.type === 'OTHER';
  const valid =
    !!form.startDate && !!form.endDate && form.endDate >= form.startDate && days > 0 &&
    (!reasonRequired || form.reason.trim().length > 1);

  const save = useMutation({
    mutationFn: () =>
      api.post('/leave', {
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave'] });
      qc.invalidateQueries({ queryKey: ['leave-summary'] });
      qc.invalidateQueries({ queryKey: ['leave-pending-count'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Leave requested', {
        description: `${days} working day${days === 1 ? '' : 's'} sent for approval.`,
      });
      onClose();
    },
    onError: (e) => setError(extractMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request leave"
      description="Weekends aren't counted, so a Friday-to-Monday absence is two days."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            <CalendarPlus className="h-4 w-4" />
            Request {days ? `${days} day${days === 1 ? '' : 's'}` : 'leave'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Leave type" required className="sm:col-span-2">
          <Select value={form.type} onChange={(e) => set({ type: e.target.value as LeaveType })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{LEAVE_LABEL[t]} leave</option>
            ))}
          </Select>
        </Field>

        <Field label="First day off" required>
          <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        <Field label="Last day off" required>
          <Input
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </Field>

        {/* The count is the thing being approved, so it gets its own line
            rather than being buried in the button. */}
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-[13px] ring-1 ring-inset sm:col-span-2',
            allWeekend
              ? 'bg-red-500/[0.06] ring-red-500/20'
              : days
                ? 'bg-emerald-500/[0.06] ring-emerald-500/20'
                : 'bg-[color:var(--surface-sunken)] ring-transparent',
          )}
        >
          <CalendarCheck2
            className={cn(
              'h-4 w-4 shrink-0',
              allWeekend ? 'text-red-600 dark:text-red-400' : days ? 'text-emerald-600 dark:text-emerald-400' : 'text-[color:var(--text-muted)]',
            )}
          />
          {allWeekend ? (
            <span>That range is all weekend — there are no working days to book off.</span>
          ) : days ? (
            <span>
              <span className="font-medium">{days} working day{days === 1 ? '' : 's'}</span>{' '}
              · {fmtDateRange(form.startDate, form.endDate)}
            </span>
          ) : (
            <span className="text-muted">Pick your dates to see the working-day count.</span>
          )}
        </div>

        {backdated && !allWeekend && (
          <p className="text-secondary -mt-1 flex items-start gap-2 text-[12.5px] sm:col-span-2">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            This starts in the past. That's fine for recording sick leave after the
            fact — just expect your approver to ask.
          </p>
        )}

        <Field
          label="Reason"
          required={reasonRequired}
          className="sm:col-span-2"
          hint={
            reasonRequired
              ? 'Required for "Other" — the type alone says nothing.'
              : "Optional, but it's what your approver reads before deciding."
          }
        >
          <Textarea
            value={form.reason}
            onChange={(e) => set({ reason: e.target.value })}
            placeholder="e.g. Family wedding — back on the Monday."
            rows={2}
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 sm:col-span-2 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
