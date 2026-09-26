import { useQuery } from '@tanstack/react-query';
import { Layers, Users2, ListChecks, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { fmtDate, humanise } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ModuleDetail, TaskStatus } from '@/lib/types';

const TASK_BAR: Record<TaskStatus, string> = {
  TODO: 'bg-slate-400',
  IN_PROGRESS: 'bg-sky-500',
  IN_REVIEW: 'bg-violet-500',
  BLOCKED: 'bg-red-500',
  DONE: 'bg-emerald-500',
};

/**
 * Drill-down for a module or sub-module: who's on it and
 * what work is open — rather than just a count of resources.
 */
export function ModuleDetailModal({
  target,
  onClose,
  onOpenSubModule,
}: {
  target: { kind: 'module' | 'subModule'; id: string; name: string } | null;
  onClose: () => void;
  onOpenSubModule?: (sub: { id: string; name: string }) => void;
}) {
  const path = target?.kind === 'module'
    ? `/projects/modules/${target.id}/detail`
    : `/projects/sub-modules/${target?.id}/detail`;

  const { data: d, isLoading } = useQuery({
    queryKey: ['module-detail', target?.kind, target?.id],
    queryFn: async () => (await api.get<ModuleDetail>(path)).data,
    enabled: !!target,
  });

  const project = d?.project ?? d?.module?.project;
  const totalTasks = d ? Object.values(d.taskBreakdown).reduce((a, b) => a + b, 0) : 0;
  // People on the project (or parent module) who aren't narrowed to this one.
  const broader = d?.broaderAssignments ?? [];

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Layers className="text-muted h-4 w-4" />
          {target?.name ?? 'Module'}
        </span>
      }
      description={
        d
          ? target?.kind === 'subModule'
            ? `${project?.code} · ${d.module?.name} › ${target.name}`
            : `${project?.code} · ${project?.name}`
          : undefined
      }
      size="lg"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {isLoading || !d ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {d.description && (
            <p className="text-secondary text-[13px] leading-relaxed">{d.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Metric label="People" value={d.assignments.length} sub={broader.length ? `+${broader.length} wider` : undefined} />
            <Metric label="Tasks" value={totalTasks} />
          </div>

          {totalTasks > 0 && (
            <div>
              <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">
                Task status
              </p>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {(Object.keys(d.taskBreakdown) as TaskStatus[]).map((st) =>
                  d.taskBreakdown[st] ? (
                    <div
                      key={st}
                      className={cn(TASK_BAR[st], 'first:rounded-l-full last:rounded-r-full')}
                      style={{ width: `${(d.taskBreakdown[st] / totalTasks) * 100}%` }}
                      title={`${humanise(st)}: ${d.taskBreakdown[st]}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {(Object.keys(d.taskBreakdown) as TaskStatus[])
                  .filter((st) => d.taskBreakdown[st])
                  .map((st) => (
                    <span key={st} className="text-secondary inline-flex items-center gap-1.5 text-[12px]">
                      <span className={cn('h-2 w-2 rounded-full', TASK_BAR[st])} />
                      {humanise(st)} <span className="tnum font-medium">{d.taskBreakdown[st]}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Sub-modules, drillable one level further */}
          {!!d.subModules?.length && (
            <Section title="Sub-modules">
              <ul className="divide-y">
                {d.subModules.map((sm) => (
                  <li key={sm.id}>
                    <button
                      onClick={() => onOpenSubModule?.({ id: sm.id, name: sm.name })}
                      className="-mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 hover:bg-[color:var(--surface-hover)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{sm.name}</span>
                      <span className="text-muted tnum text-[12px]">
                        {sm._count?.assignments ?? 0} people · {sm._count?.tasks ?? 0} tasks
                      </span>
                      <ChevronRight className="text-muted h-4 w-4 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}


          <Section title={`Placed on this specifically (${d.assignments.length})`}>
            {!d.assignments.length ? (
              <p className="text-muted rounded-lg bg-[color:var(--surface-sunken)] px-3 py-4 text-center text-[12.5px]">
                {broader.length
                  ? 'Nobody is scoped to this specifically — see below for people on the wider project.'
                  : 'Nobody placed here yet.'}
              </p>
            ) : (
              <ul className="divide-y">
                {d.assignments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={a.resource.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{a.resource.name}</p>
                      <p className="text-muted mt-0.5 truncate text-[12px]">
                        {a.resource.designation ?? 'No title'}
                        {a.resource.type === 'EXTERNAL' && a.resource.serviceProvider ? ` · ${a.resource.serviceProvider.name}` : ' · Internal'}
                        {a.subModule ? ` · ${a.subModule.name}` : ''}
                      </p>
                    </div>
                    {a.allocationPct < 100 && (
                      <span className="text-muted tnum text-[12px]">{a.allocationPct}%</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* A placement is either scoped to this module or it isn't. These
              people are on the project but not narrowed to it — listing them
              stops the page reading as "nobody is on this project at all". */}
          {!!broader.length && (
            <Section title={`Also working on the wider scope (${broader.length})`}>
              <p className="text-muted mb-2 text-[12px] leading-relaxed">
                Placed on the project without narrowing to this. They aren't counted above.
              </p>
              <ul className="divide-y">
                {broader.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={a.resource.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{a.resource.name}</p>
                      <p className="text-muted mt-0.5 truncate text-[12px]">
                        {a.roleOnProject ?? a.resource.designation ?? 'No title'}
                        {a.resource.type === 'EXTERNAL' && a.resource.serviceProvider
                          ? ` · ${a.resource.serviceProvider.name}`
                          : ' · Internal'}
                      </p>
                    </div>
                    <StatusPill
                      tone="neutral"
                      label={a.scope === 'MODULE' ? a.module?.name ?? 'Module' : 'Whole project'}
                      dot={false}
                      animateChange={false}
                    />
                    {a.allocationPct < 100 && (
                      <span className="text-muted tnum text-[12px]">{a.allocationPct}%</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Open work">
            {!d.tasks.length ? (
              <p className="text-muted rounded-lg bg-[color:var(--surface-sunken)] px-3 py-4 text-center text-[12.5px]">
                No tasks recorded here.
              </p>
            ) : (
              <ul className="divide-y">
                {d.tasks.slice(0, 8).map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE';
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <ListChecks className="text-muted h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{t.title}</p>
                        <p className="text-muted mt-0.5 truncate text-[11.5px]">
                          {t.ticketId ? `${t.ticketId} · ` : ''}{t.assignee.name}
                        </p>
                      </div>
                      {t.dueDate && (
                        <span className={cn('shrink-0 text-[11.5px]', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
                          {fmtDate(t.dueDate, 'd MMM')}
                        </span>
                      )}
                      <StatusPill status={t.status} dot={false} animateChange={false} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">{title}</p>
      {children}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2.5 text-center">
      <p className="tnum text-[20px] leading-none font-semibold">{value}</p>
      <p className="text-muted mt-1.5 text-[11px]">
        {label}
        {sub ? <span className="tnum"> · {sub}</span> : null}
      </p>
    </div>
  );
}
