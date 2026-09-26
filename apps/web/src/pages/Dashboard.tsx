import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  FolderKanban, Users2, UserRound, ListChecks, ReceiptText,
  AlertTriangle, Clock3, ArrowUpRight, Activity, ShieldCheck, CalendarOff, CalendarPlus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { CheckInOutCard } from '@/features/CheckInOutCard';
import { ApprovalActions } from '@/features/ApprovalActions';
import { listVariants } from '@/lib/motion';
import { fmtDate, fmtDateRange, fmtDuration, fmtMoney, fmtMoneyMulti, fmtRelative, fmtTime, humanise, LEAVE_LABEL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DashboardData, TaskStatus } from '@/lib/types';

const TASK_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
const TASK_BAR: Record<TaskStatus, string> = {
  TODO: 'bg-slate-400',
  IN_PROGRESS: 'bg-sky-500',
  IN_REVIEW: 'bg-violet-500',
  BLOCKED: 'bg-red-500',
  DONE: 'bg-emerald-500',
};

export default function Dashboard() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <CardSkeleton />
      </>
    );
  }
  if (error || !data) return <ErrorState message="Couldn't load your dashboard." onRetry={refetch} />;

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          data.role === 'RESOURCE'
            ? 'Your day at a glance — attendance, assigned work, and invoices.'
            : data.role === 'PM'
              ? 'Your projects, your people, and where your resource requests stand.'
              : data.role === 'EM'
                ? 'Your projects, and the resource assignments waiting on your sign-off.'
                : 'System-wide view across every project, manager and resource.'
        }
      />

      {data.role === 'RESOURCE' ? <ResourceView data={data} /> : <ManagerView data={data} />}
    </>
  );
}

/* ==========================================================================
   Resource — the first thing they need is the check-in button.
   ========================================================================== */
function ResourceView({ data }: { data: DashboardData }) {
  const mtd = data.monthToDate;

  return (
    <div className="space-y-5">
      <CheckInOutCard />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="This month"
          value={fmtDuration(mtd?.workMinutes ?? 0)}
          sub={`${mtd?.days ?? 0} days logged`}
          icon={Clock3}
        />
        <StatCard
          label="Approved OT"
          value={fmtDuration(mtd?.approvedOtMinutes ?? 0)}
          sub={
            (mtd?.otMinutes ?? 0) > (mtd?.approvedOtMinutes ?? 0)
              ? `${fmtDuration((mtd?.otMinutes ?? 0) - (mtd?.approvedOtMinutes ?? 0))} awaiting`
              : 'All decided'
          }
          icon={Activity}
          tone={(mtd?.otMinutes ?? 0) > (mtd?.approvedOtMinutes ?? 0) ? 'amber' : 'neutral'}
        />
        <StatCard label="Open tasks" value={data.myTasks?.length ?? 0} sub={`${data.stats.overdueTasks} overdue`} icon={ListChecks} tone={data.stats.overdueTasks > 0 ? 'red' : 'neutral'} />
        {data.canInvoice ? (
          <StatCard label="Invoices" value={data.stats.invoices} sub={fmtMoneyMulti(data.invoiceSummary.totalsByCurrency)} icon={ReceiptText} />
        ) : (
          <StatCard label="Projects" value={data.stats.projects} sub="You're placed on" icon={FolderKanban} />
        )}
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Two independent stacks, so a short list never leaves a gap beside a taller card. */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="My tasks"
              description="Open work assigned to you, soonest due first."
              action={
                <Link to="/my-tasks" className="text-secondary inline-flex items-center gap-1 text-[13px] hover:text-[color:var(--text-primary)]">
                  View all <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <CardBody className="pt-0">
              {!data.myTasks?.length ? (
                <EmptyState icon={ListChecks} title="Nothing open" description="You have no tasks in progress." />
              ) : (
                <ul className="divide-y">
                  {data.myTasks.map((t) => {
                    const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE';
                    return (
                      <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{t.title}</p>
                          <p className="text-muted mt-0.5 truncate text-[12px]">
                            {t.project.code}
                            {t.module && ` · ${t.module.name}`}
                            {t.ticketId && ` · ${t.ticketId}`}
                          </p>

                        </div>
                        <span className={cn('shrink-0 text-[12px]', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
                          {t.dueDate ? fmtDate(t.dueDate, 'd MMM') : '—'}
                        </span>
                        <StatusPill status={t.status} dot={false} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card className="flex-1">
            <CardHeader title="My assignments" description="Projects and modules you're placed on." />
            <CardBody className="pt-0">
              {!data.profile?.assignments?.length ? (
                <EmptyState icon={FolderKanban} title="Not assigned yet" description="A manager will place you on a project soon." />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.profile.assignments.map((a) => (
                    <span key={a.id} className="rounded-lg border bg-[color:var(--surface-sunken)] px-2.5 py-1.5 text-[12.5px]">
                      <span className="font-medium">{a.project.code}</span>
                      {a.module && <span className="text-secondary"> › {a.module.name}</span>}
                      {a.subModule && <span className="text-muted"> › {a.subModule.name}</span>}
                      {a.roleOnProject && <span className="text-secondary"> · {a.roleOnProject}</span>}
                      {a.allocationPct < 100 && <span className="text-muted tnum"> · {a.allocationPct}%</span>}
                    </span>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {data.canInvoice ? (
            <Card>
              <CardHeader
                title="My invoices"
                action={
                  <Link to="/my-invoices" className="text-secondary inline-flex items-center gap-1 text-[13px] hover:text-[color:var(--text-primary)]">
                    View all <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <CardBody className="pt-0">
                {!data.myInvoices?.length ? (
                  <EmptyState icon={ReceiptText} title="No invoices yet" description="Raise your first monthly invoice from My Invoices." />
                ) : (
                  <ul className="divide-y">
                    {data.myInvoices.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[12.5px] font-medium">{i.invoiceNumber}</p>
                          <p className="text-muted mt-0.5 text-[11.5px]">
                            {fmtDate(i.periodFrom, 'd MMM')} – {fmtDate(i.periodTo, 'd MMM')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tnum text-[13px] font-medium">{fmtMoney(i.total, i.currency)}</p>
                          <div className="mt-1"><StatusPill status={i.status} dot={false} /></div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Invoicing" />
              <CardBody className="pt-0">
                <EmptyState
                  icon={ReceiptText}
                  title="Not applicable"
                  description={`Invoicing runs through ${data.profile?.serviceProvider?.name ?? 'your service provider'}, so it isn't part of your PeopleFlow account.`}
                />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">

          {/* Their own leave: pending plus anything approved still ahead. Past
              approved leave is history and lives on the Leave screen. */}
          <Card>
            <CardHeader
              title="My leave"
              description="Pending requests and time off still to come."
              action={
                <Link to="/my-leave">
                  <Button size="sm" variant="ghost">
                    <CalendarPlus className="h-3.5 w-3.5" /> Request
                  </Button>
                </Link>
              }
            />
            <CardBody className="pt-0">
              {!data.myLeave?.length ? (
                <EmptyState
                  icon={CalendarOff}
                  title="No leave booked"
                  description="Nothing pending and nothing coming up."
                  action={
                    <Link to="/my-leave">
                      <Button variant="secondary" size="sm">
                        <CalendarPlus className="h-3.5 w-3.5" /> Request leave
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {data.myLeave.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {fmtDateRange(l.startDate, l.endDate)}
                        </p>
                        <p className="text-muted mt-0.5 truncate text-[11.5px]">
                          {LEAVE_LABEL[l.type]} · {l.days} day{l.days === 1 ? '' : 's'}
                          {l.decisionNote ? ` · “${l.decisionNote}”` : ''}
                        </p>
                      </div>
                      <StatusPill status={l.status} dot={false} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card className="flex-1">
            <CardHeader title="Recent attendance" description="Your last 7 logged days." />
            <CardBody className="pt-0">
              {!data.recentAttendance?.length ? (
                <EmptyState icon={Clock3} title="No history yet" />
              ) : (
                <ul className="divide-y">
                  {data.recentAttendance.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">{fmtDate(a.date, 'EEE, d MMM')}</p>
                        <p className="text-muted mt-0.5 text-[12px]">
                          {fmtTime(a.checkInAt)} – {a.checkOutAt ? fmtTime(a.checkOutAt) : 'in progress'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-[13px] font-medium">{fmtDuration(a.workMinutes)}</p>
                        {a.otMinutes > 0 && (
                          <p className="tnum mt-0.5 text-[11.5px] text-amber-600 dark:text-amber-400">
                            +{fmtDuration(a.otMinutes)} OT
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   PM / Admin — approvals first, then the org picture.
   ========================================================================== */
function ManagerView({ data }: { data: DashboardData }) {
  const { user } = useAuth();
  const isAdmin = data.role === 'ADMIN';
  const needs = data.needsAction;
  // Invoice decisions are Admin-only, so a PM's action panel covers overtime alone.
  const canApproveInvoices = user?.canApproveInvoices === true;
  // An EM/Admin decides assignment requests; a PM's own requests are status, not
  // an action, so they get their own calm card further down instead.
  const canApproveAssignments = user?.canApproveAssignments === true;
  const pendingAssignments = needs?.pendingAssignments ?? [];
  // Leave is decided by an EM or an Admin — the same people who decide
  // assignments — so it shares that flag rather than needing its own.
  const pendingLeave = needs?.pendingLeave ?? [];
  const upcomingLeave = data.upcomingLeave ?? [];
  const actionColumns =
    1 + (canApproveInvoices ? 1 : 0) + (canApproveAssignments ? 2 : 0);

  return (
    <div className="space-y-5">
      {/* Needs your action leads, because it's the only thing that blocks other people. */}
      {!!needs?.totalPending && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="ring-1 ring-amber-500/25">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Needs your action
                  <span className="tnum rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                    {needs.totalPending}
                  </span>
                </span>
              }
              description={
                canApproveAssignments
                  ? 'Leave, resource assignments, overtime and invoices waiting on your decision.'
                  : 'Overtime and invoices waiting on your decision.'
              }
            />
            <CardBody className="pt-0">
              <div
                className={cn(
                  'grid gap-5',
                  actionColumns === 2 && 'lg:grid-cols-2',
                  actionColumns >= 3 && 'lg:grid-cols-2 xl:grid-cols-4',
                )}
              >
                {canApproveAssignments && (
                  <div>
                    <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">
                      Leave ({pendingLeave.length})
                    </p>
                    {!pendingLeave.length ? (
                      <p className="text-muted py-3 text-[13px]">Nothing pending.</p>
                    ) : (
                      <ul className="divide-y">
                        {pendingLeave.map((l) => (
                          <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                            <Avatar name={l.resource.name} color={l.resource.user?.avatarColor} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium">{l.resource.name}</p>
                              <p className="text-muted mt-0.5 truncate text-[11.5px]">
                                {LEAVE_LABEL[l.type]} · {fmtDateRange(l.startDate, l.endDate)} · {l.days}d
                                {l.reason ? ` · ${l.reason}` : ''}
                              </p>
                            </div>
                            <ApprovalActions kind="leave" id={l.id} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {canApproveAssignments && (
                  <div>
                    <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">
                      Assignments ({pendingAssignments.length})
                    </p>
                    {!pendingAssignments.length ? (
                      <p className="text-muted py-3 text-[13px]">Nothing pending.</p>
                    ) : (
                      <ul className="divide-y">
                        {pendingAssignments.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                            <Avatar name={r.resource.name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium">{r.resource.name}</p>
                              <p className="text-muted mt-0.5 truncate text-[11.5px]">
                                {r.project.code}
                                {r.module ? ` › ${r.module.name}` : ''} · {r.allocationPct}% ·{' '}
                                {r.requestedBy.name}
                              </p>
                            </div>
                            <ApprovalActions kind="assignment" id={r.id} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">
                    Overtime ({needs.pendingOvertime.length})
                  </p>
                  {!needs.pendingOvertime.length ? (
                    <p className="text-muted py-3 text-[13px]">Nothing pending.</p>
                  ) : (
                    <ul className="divide-y">
                      {needs.pendingOvertime.map((ot) => (
                        <li key={ot.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                          <Avatar name={ot.attendance?.user?.name} color={ot.attendance?.user?.avatarColor} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{ot.attendance?.user?.name}</p>
                            <p className="text-muted mt-0.5 text-[11.5px]">
                              {fmtDate(ot.attendance?.date, 'd MMM')} · {fmtDuration(ot.minutes)}
                              {ot.reason && ` · ${ot.reason}`}
                            </p>
                          </div>
                          <ApprovalActions kind="overtime" id={ot.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canApproveInvoices && (
                <div>
                  <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">
                    Invoices ({needs.pendingInvoices.length})
                  </p>
                  {!needs.pendingInvoices.length ? (
                    <p className="text-muted py-3 text-[13px]">Nothing pending.</p>
                  ) : (
                    <ul className="divide-y">
                      {needs.pendingInvoices.map((inv) => (
                        <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{inv.user.name}</p>
                            <p className="text-muted mt-0.5 font-mono text-[11.5px]">
                              {inv.invoiceNumber} · {fmtMoney(inv.total, inv.currency)}
                            </p>
                          </div>
                          <ApprovalActions kind="invoice" id={inv.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                )}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* A PM can't act on these — they're waiting on someone else — so they sit
          outside "Needs your action" and stay neutral rather than amber. */}
      {!canApproveAssignments && !!pendingAssignments.length && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="text-muted h-4 w-4" />
                Waiting on approval
                <span className="tnum text-muted rounded-full bg-[color:var(--surface-sunken)] px-2 py-0.5 text-[12px] font-semibold">
                  {pendingAssignments.length}
                </span>
              </span>
            }
            description="Resources you've asked for. They join the project once the Engineering Manager signs off."
            action={
              <Link to="/assignment-requests?status=PENDING">
                <Button size="sm" variant="ghost">View all</Button>
              </Link>
            }
          />
          <CardBody className="pt-0">
            <ul className="divide-y">
              {pendingAssignments.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                  <Avatar name={r.resource.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{r.resource.name}</p>
                    <p className="text-muted mt-0.5 truncate text-[11.5px]">
                      {r.project.code}
                      {r.module ? ` › ${r.module.name}` : ''} · {r.allocationPct}% · asked{' '}
                      {fmtRelative(r.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Read-only for everyone here, including a PM who can't decide leave but
          still has to plan around it. */}
      {!!upcomingLeave.length && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarOff className="text-muted h-4 w-4" />
                Away soon
              </span>
            }
            description="Approved leave still ahead, soonest first."
            action={
              <Link to="/leave?status=APPROVED">
                <Button size="sm" variant="ghost">View all</Button>
              </Link>
            }
          />
          <CardBody className="pt-0">
            <ul className="flex flex-wrap gap-2">
              {upcomingLeave.map((l) => (
                <li key={l.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2">
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

      {user?.canCheckIn && <CheckInOutCard compact />}

      <motion.div variants={listVariants} initial="initial" animate="animate" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Projects" value={data.stats.projects} sub={`${data.stats.activeProjects} active`} icon={FolderKanban} />
        <StatCard
          label="Resources"
          value={data.stats.resources}
          sub={`${data.resourceMix?.internal ?? 0} internal · ${data.resourceMix?.external ?? 0} external`}
          icon={UserRound}
        />
        <StatCard
          label="Tasks"
          value={data.stats.tasks}
          sub={data.stats.overdueTasks > 0 ? `${data.stats.overdueTasks} overdue` : 'On track'}
          icon={ListChecks}
          tone={data.stats.overdueTasks > 0 ? 'red' : 'neutral'}
        />
        <StatCard
          label={canApproveInvoices ? 'Invoices' : 'My invoices'}
          value={data.stats.invoices}
          sub={fmtMoneyMulti(data.invoiceSummary.totalsByCurrency)}
          icon={ReceiptText}
        />
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Two independent stacks: a short card can never leave a hole beside a taller neighbour. */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Structure overview"
              description={isAdmin ? 'Every project in the system.' : 'Projects assigned to you.'}
              action={
                <Link to="/projects" className="text-secondary inline-flex items-center gap-1 text-[13px] hover:text-[color:var(--text-primary)]">
                  All projects <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <CardBody className="pt-0">
              {!data.structureOverview.length ? (
                <EmptyState icon={FolderKanban} title="No projects yet" />
              ) : (
                <ul className="divide-y">
                  {data.structureOverview.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/projects/${p.id}`}
                        className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-[color:var(--surface-hover)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{p.name}</p>
                          <p className="text-muted mt-0.5 truncate text-[12px]">
                            {p.code} · {p.client}
                          </p>
                        </div>
                        <div className="text-muted flex items-center gap-4 text-[12px]">
                          <span className="tnum">{p.headcount} {p.headcount === 1 ? 'person' : 'people'}</span>
                          <span className="tnum hidden sm:inline">{p.taskCount} {p.taskCount === 1 ? 'task' : 'tasks'}</span>
                        </div>
                        <StatusPill status={p.status} dot={false} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <div className="flex-1 grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader title="Task breakdown" description="Across everything you can see." />
            <CardBody className="pt-0">
              <TaskBreakdown breakdown={data.taskBreakdown} total={data.stats.tasks} />
            </CardBody>
          </Card>


          <Card>
            <CardHeader
              title="Overdue tasks"
              description={data.stats.overdueTasks > 0 ? `${data.stats.overdueTasks} past due` : 'Nothing overdue'}
              action={
                <Link to="/tasks?overdue=true" className="text-secondary inline-flex items-center gap-1 text-[13px] hover:text-[color:var(--text-primary)]">
                  View <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <CardBody className="pt-0">
              {!data.overdueTasks?.length ? (
                <EmptyState icon={ListChecks} title="All on schedule" />
              ) : (
                <ul className="divide-y">
                  {data.overdueTasks.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5 py-2.5 first:pt-0">
                      <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{t.title}</p>
                        <p className="text-muted mt-0.5 truncate text-[11.5px]">{t.project.code}</p>
                      </div>
                      <span className="shrink-0 text-[11.5px] font-medium text-red-600 dark:text-red-400">
                        {fmtDate(t.dueDate, 'd MMM')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader title="Today's attendance" description={fmtDate(data.attendanceToday?.date, 'EEEE, d MMM')} />
          <CardBody className="pt-0">
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              {[
                ['On the clock', data.attendanceToday?.checkedIn ?? 0, 'text-emerald-600 dark:text-emerald-400'],
                ['Completed', data.attendanceToday?.completed ?? 0, ''],
                ['On OT', data.attendanceToday?.onOvertime ?? 0, 'text-amber-600 dark:text-amber-400'],
              ].map(([label, value, tone]) => (
                <div key={label as string} className="rounded-lg bg-[color:var(--surface-sunken)] px-2 py-2.5">
                  <p className={cn('tnum text-[20px] leading-none font-semibold', tone as string)}>{value as number}</p>
                  <p className="text-muted mt-1.5 text-[11px]">{label as string}</p>
                </div>
              ))}
            </div>

            {!data.attendanceToday?.people.length ? (
              <p className="text-muted py-2 text-center text-[13px]">Nobody is checked in right now.</p>
            ) : (
              <ul className="space-y-2">
                {data.attendanceToday.people.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <Avatar name={a.user?.name} color={a.user?.avatarColor} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{a.user?.name}</span>
                    <span className="text-muted tnum text-[12px]">since {fmtTime(a.checkInAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>


        <Card>
          <CardHeader title="Resource mix" description="Internal vs service provider headcount." />
          <CardBody className="pt-0">
            <MixBar internal={data.resourceMix?.internal ?? 0} external={data.resourceMix?.external ?? 0} />
            {!!data.resourceMix?.serviceProviders.length && (
              <ul className="mt-4 space-y-1.5">
                {data.resourceMix.serviceProviders.map((p) => (
                  <li key={p.company} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-secondary truncate">{p.company}</span>
                    <span className="tnum font-medium">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>


          <Card className="flex-1">
            <CardHeader
              title={canApproveInvoices ? 'Invoice summary' : 'My invoices'}
              description={
                canApproveInvoices
                  ? `${fmtMoneyMulti(data.invoiceSummary.totalsByCurrency)} across everyone`
                  : `${fmtMoneyMulti(data.invoiceSummary.totalsByCurrency)} raised by you`
              }
              action={
                <Link to="/invoices" className="text-secondary inline-flex items-center gap-1 text-[13px] hover:text-[color:var(--text-primary)]">
                  {canApproveInvoices ? 'Queue' : 'View all'} <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <CardBody className="pt-0">
              <ul className="space-y-2.5">
                {(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map((s) => {
                  const row = data.invoiceSummary.byStatus[s];
                  return (
                    <li key={s} className="flex items-center justify-between gap-3">
                      <StatusPill status={s} dot={false} animateChange={false} />
                      <div className="text-right">
                        <span className="tnum text-[13.5px] font-medium">{row.count}</span>
                        <span className="text-muted tnum ml-2 text-[12px]">{fmtMoneyMulti(row.totals)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {isAdmin && !!data.recentActivity?.length && (
        <Card>
          <CardHeader
            title="Recent activity"
            description="Latest entries from the audit trail."
            action={
              <Link to="/audit" className="text-secondary inline-flex items-center gap-1 text-[13px] hover:text-[color:var(--text-primary)]">
                Full log <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <CardBody className="pt-0">
            <ul className="divide-y">
              {data.recentActivity.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <Avatar name={e.actorName} color={e.actor?.avatarColor} size="xs" />
                  <p className="min-w-0 flex-1 truncate text-[13px]">
                    <span className="font-medium">{e.actorName}</span>{' '}
                    <span className="text-secondary">{e.summary}</span>
                  </p>
                  <span className="text-muted shrink-0 text-[11.5px]">{fmtRelative(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function MixBar({ internal, external }: { internal: number; external: number }) {
  const total = internal + external || 1;
  return (
    <>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]">
        <motion.div
          className="bg-sky-500"
          initial={{ width: 0 }}
          animate={{ width: `${(internal / total) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.div
          className="bg-violet-500"
          initial={{ width: 0 }}
          animate={{ width: `${(external / total) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[12.5px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> Internal
          <span className="tnum font-medium">{internal}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-500" /> External
          <span className="tnum font-medium">{external}</span>
        </span>
      </div>
    </>
  );
}

function TaskBreakdown({ breakdown, total }: { breakdown: Record<TaskStatus, number>; total: number }) {
  const safeTotal = total || 1;
  return (
    <>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {TASK_ORDER.map((s, i) => {
          const v = breakdown[s] ?? 0;
          if (!v) return null;
          return (
            <motion.div
              key={s}
              className={cn(TASK_BAR[s], 'first:rounded-l-full last:rounded-r-full')}
              initial={{ width: 0 }}
              animate={{ width: `${(v / safeTotal) * 100}%` }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
            />
          );
        })}
      </div>
      <ul className="mt-4 space-y-2">
        {TASK_ORDER.map((s) => (
          <li key={s} className="flex items-center justify-between text-[12.5px]">
            <span className="text-secondary inline-flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', TASK_BAR[s])} />
              {humanise(s)}
            </span>
            <span className="tnum font-medium">{breakdown[s] ?? 0}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
