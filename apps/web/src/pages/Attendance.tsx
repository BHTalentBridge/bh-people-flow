import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Timer, Users2, Clock3, Sigma, Download } from 'lucide-react';
import { api, toastError, type Paginated } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Tabs } from '@/components/ui/Tabs';
import { Select, Input, Field } from '@/components/ui/Field';
import { StatCard } from '@/components/ui/StatCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, TableSkeleton } from '@/components/ui/States';
import { CheckInOutCard } from '@/features/CheckInOutCard';
import { ApprovalActions } from '@/features/ApprovalActions';
import { fmtDate, fmtDayLabel, fmtDuration, fmtTime } from '@/lib/format';
import { listVariants, panelVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';
import type { Attendance as AttendanceRow, OvertimeRequest } from '@/lib/types';

type Tab = 'log' | 'overtime';

export default function Attendance() {
  const { user, canManage } = useAuth();
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);
  const [exporting, setExporting] = useState(false);
  const tab = (state.tab as Tab) ?? 'log';

  const isSelfView = !canManage;

  const params = clean({
    page: state.page,
    pageSize: 25,
    search,
    from: state.from,
    to: state.to,
    userId: state.userId,
    projectId: state.projectId,
    otStatus: state.otStatus,
  });

  const { data: summary } = useQuery({
    queryKey: ['attendance', 'summary', params],
    queryFn: async () => (await api.get('/attendance/summary', { params })).data as {
      days: number; workMinutes: number; otMinutes: number; totalMinutes: number;
      approvedOtMinutes: number; pendingOtCount: number; currentlyCheckedIn: number;
    },
  });

  const { data: log, isLoading: logLoading } = useQuery({
    queryKey: ['attendance', 'log', params],
    queryFn: async () => (await api.get<Paginated<AttendanceRow>>('/attendance', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
    enabled: tab === 'log',
  });

  const otParams = clean({
    page: state.page, pageSize: 25, search,
    status: state.status, from: state.from, to: state.to,
  });
  const { data: overtime, isLoading: otLoading } = useQuery({
    queryKey: ['overtime', otParams],
    queryFn: async () => (await api.get<Paginated<OvertimeRequest>>('/attendance/overtime/list', { params: otParams })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
    enabled: tab === 'overtime',
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['project-options'],
    queryFn: async () => (await api.get('/projects/options')).data as { id: string; name: string; code: string }[],
    enabled: canManage,
  });

  const activeCount = ['from', 'to', 'projectId', 'otStatus', 'status'].filter((k) => state[k]).length;

  /**
   * Downloads the current view as .xlsx. Goes through axios so the auth header
   * is sent — a plain link would be rejected.
   */
  const exportXlsx = async () => {
    setExporting(true);
    try {
      const res = await api.get('/attendance/export', {
        params: clean({ search, from: state.from, to: state.to, userId: state.userId,
                        projectId: state.projectId, otStatus: state.otStatus }),
        responseType: 'blob',
      });
      const name =
        /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ??
        `timesheet-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Timesheet exported', { description: name });
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={isSelfView ? 'My attendance' : 'Attendance & overtime'}
        description={
          isSelfView
            ? 'Your daily check-ins, hours worked, and the status of any overtime you logged.'
            : user?.canCheckIn
              ? 'Everyone in your scope. Overtime only counts as logged once you approve it.'
              : 'Everyone in the system. Administrators review attendance rather than record it, and overtime only counts as logged once approved.'
        }
      />

      {/* Admins oversee attendance rather than record it, so they get no clock. */}
      {user?.canCheckIn && (
        <div className="mb-5">
          <CheckInOutCard />
        </div>
      )}

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Days logged" value={summary?.days ?? 0} icon={CalendarClock} />
        <StatCard label="Hours worked" value={fmtDuration(summary?.workMinutes ?? 0)} icon={Clock3} />
        {/* Working + OT. The unpaid break is already excluded from both. */}
        <StatCard
          label="Total hours"
          value={fmtDuration(summary?.totalMinutes ?? 0)}
          sub="Work + OT, break excluded"
          icon={Sigma}
        />
        <StatCard
          label="Overtime"
          value={fmtDuration(summary?.otMinutes ?? 0)}
          sub={`${fmtDuration(summary?.approvedOtMinutes ?? 0)} approved`}
          icon={Timer}
          tone={(summary?.pendingOtCount ?? 0) > 0 ? 'amber' : 'neutral'}
        />
        <StatCard
          label={isSelfView ? 'Awaiting approval' : 'On the clock now'}
          value={isSelfView ? (summary?.pendingOtCount ?? 0) : (summary?.currentlyCheckedIn ?? 0)}
          icon={Users2}
          tone={isSelfView && (summary?.pendingOtCount ?? 0) > 0 ? 'amber' : 'neutral'}
        />
      </motion.div>

      <Tabs
        tabs={[
          { value: 'log', label: 'Daily log' },
          { value: 'overtime', label: isSelfView ? 'My overtime' : 'Overtime approvals', count: summary?.pendingOtCount },
        ]}
        value={tab}
        onChange={(v) => set({ tab: v === 'log' ? undefined : v, page: undefined })}
        className="mb-4"
        idPrefix="attendance"
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Filter by name…"
        activeCount={activeCount}
        onClear={() => { reset(); setSearchInput(''); }}
        actions={
          <Button onClick={exportXlsx} loading={exporting}>
            <Download className="h-4 w-4" /> Export timesheet
          </Button>
        }
        filters={
          <>
            <Field label="From"><Input type="date" value={state.from ?? ''} onChange={(e) => set({ from: e.target.value })} /></Field>
            <Field label="To"><Input type="date" value={state.to ?? ''} onChange={(e) => set({ to: e.target.value })} /></Field>
            {tab === 'log' ? (
              <>
                {canManage && (
                  <Field label="Project">
                    <Select value={state.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value })}>
                      <option value="">All projects</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Overtime">
                  <Select value={state.otStatus ?? ''} onChange={(e) => set({ otStatus: e.target.value })}>
                    <option value="">Any</option>
                    <option value="PENDING">Pending approval</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </Select>
                </Field>
              </>
            ) : (
              <Field label="Status">
                <Select value={state.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
                  <option value="">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </Select>
              </Field>
            )}
          </>
        }
      />

      {/* Enter-only: see panelVariants. Switching tabs must never wait on the
          previous panel animating out. */}
      <motion.div key={tab} variants={panelVariants} initial="initial" animate="animate">
          {tab === 'log' ? (
            logLoading ? (
              <TableSkeleton cols={6} />
            ) : !log?.items.length ? (
              <TableShell><EmptyState icon={CalendarClock} title="No attendance records" description="Check in to start building your log." /></TableShell>
            ) : (
              <TableShell>
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      {canManage && <Th>Person</Th>}
                      <Th>In / Out</Th>
                      <Th align="right">Work</Th>
                      <Th align="right">Overtime</Th>
                      <Th align="right">Total</Th>
                      <Th>OT status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {log.items.map((a) => (
                        <Tr key={a.id}>
                          <Td>
                            <p className="text-[13.5px] font-medium">{fmtDayLabel(a.date)}</p>
                            <p className="text-muted mt-0.5 text-[11.5px]">{fmtDate(a.date, 'd MMM yyyy')}</p>
                          </Td>
                          {canManage && (
                            <Td>
                              <div className="flex items-center gap-2.5">
                                <Avatar name={a.user?.name} color={a.user?.avatarColor} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] font-medium">{a.user?.name}</p>
                                  <p className="text-muted truncate text-[11.5px]">
                                    {a.user?.resource?.type === 'EXTERNAL' ? a.user.resource.serviceProvider?.name : 'Internal'}
                                  </p>
                                </div>
                              </div>
                            </Td>
                          )}
                          <Td>
                            <span className="tnum text-[13px]">
                              {fmtTime(a.checkInAt)} –{' '}
                              {a.checkOutAt ? (
                                fmtTime(a.checkOutAt)
                              ) : (
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">on the clock</span>
                              )}
                            </span>
                            <p className="text-muted mt-0.5 text-[11.5px]">
                              {a.checkOutAt
                                ? a.breakMinutes > 0
                                  ? `${a.breakMinutes}m break deducted`
                                  : 'No break deducted'
                                : '—'}
                            </p>
                          </Td>
                          <Td align="right"><span className="tnum text-[13px] font-medium">{fmtDuration(a.workMinutes)}</span></Td>
                          <Td align="right">
                            {a.otMinutes > 0 ? (
                              <span className="tnum text-[13px] font-medium text-amber-600 dark:text-amber-400">
                                {fmtDuration(a.otMinutes)}
                              </span>
                            ) : (
                              <span className="text-muted text-[13px]">—</span>
                            )}
                          </Td>
                          <Td align="right">
                            {/* Work + OT; the break is already out of both. */}
                            <span className="tnum text-[13px] font-semibold">
                              {fmtDuration(a.workMinutes + a.otMinutes)}
                            </span>
                          </Td>
                          <Td>
                            {a.overtimeRequest ? (
                              <div className="flex items-center gap-2">
                                <StatusPill status={a.overtimeRequest.status} dot={false} />
                                {canManage && a.overtimeRequest.status === 'PENDING' && (
                                  <ApprovalActions kind="overtime" id={a.overtimeRequest.id} />
                                )}
                              </div>
                            ) : (
                              <span className="text-muted text-[13px]">—</span>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </Table>
                <Pagination page={log.page} pageCount={log.pageCount} total={log.total} pageSize={log.pageSize} onPage={(p) => set({ page: p })} />
              </TableShell>
            )
          ) : otLoading ? (
            <TableSkeleton cols={5} />
          ) : !overtime?.items.length ? (
            <TableShell>
              <EmptyState
                icon={Timer}
                title={isSelfView ? 'No overtime logged' : 'Nothing to approve'}
                description={isSelfView ? 'Overtime is raised automatically when you check out past 8 hours.' : "You're all caught up."}
              />
            </TableShell>
          ) : (
            <TableShell>
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    {canManage && <Th>Person</Th>}
                    <Th align="right">Overtime</Th>
                    <Th>Reason</Th>
                    <Th>Status</Th>
                    <Th align="right">{canManage ? 'Decision' : 'Decided by'}</Th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {overtime.items.map((ot) => (
                      <Tr key={ot.id} className={cn(ot.status === 'PENDING' && 'bg-amber-500/[0.035]')}>
                        <Td>
                          <p className="text-[13.5px] font-medium">{fmtDate(ot.attendance?.date, 'd MMM yyyy')}</p>
                          <p className="text-muted mt-0.5 tnum text-[11.5px]">
                            {fmtTime(ot.attendance?.checkInAt)} – {fmtTime(ot.attendance?.checkOutAt)}
                          </p>
                        </Td>
                        {canManage && (
                          <Td>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={ot.attendance?.user?.name} color={ot.attendance?.user?.avatarColor} size="sm" />
                              <span className="truncate text-[13px] font-medium">{ot.attendance?.user?.name}</span>
                            </div>
                          </Td>
                        )}
                        <Td align="right">
                          <span className="tnum text-[13.5px] font-semibold text-amber-600 dark:text-amber-400">
                            {fmtDuration(ot.minutes)}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-secondary line-clamp-2 max-w-[220px] text-[12.5px]">
                            {ot.reason ?? '—'}
                          </span>
                        </Td>
                        <Td><StatusPill status={ot.status} /></Td>
                        <Td align="right">
                          {ot.status === 'PENDING' ? (
                            canManage ? (
                              <div className="flex justify-end"><ApprovalActions kind="overtime" id={ot.id} /></div>
                            ) : (
                              <span className="text-muted text-[12.5px]">Awaiting manager</span>
                            )
                          ) : (
                            <div className="text-right">
                              <p className="text-[12.5px] font-medium">{ot.decidedBy?.name ?? '—'}</p>
                              {ot.decisionNote && (
                                <p className="text-muted mt-0.5 max-w-[200px] truncate text-[11.5px]">{ot.decisionNote}</p>
                              )}
                            </div>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </Table>
              <Pagination page={overtime.page} pageCount={overtime.pageCount} total={overtime.total} pageSize={overtime.pageSize} onPage={(p) => set({ page: p })} />
            </TableShell>
          )}
      </motion.div>
    </>
  );
}
