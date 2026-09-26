import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FolderKanban, Layers, Users2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { fmtDate } from '@/lib/format';
import { listVariants, itemVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';
import type { MyProject, MyProjectMember } from '@/lib/types';

/**
 * A resource's own view of where they're placed. **Read-only by construction** —
 * there is no mutation on this screen and the endpoint behind it returns a
 * deliberately thin projection: no managers, no pending requests, no headcount,
 * and no allocation or contact details for colleagues.
 */
export default function MyProjects() {
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-projects'],
    queryFn: async () => (await api.get<MyProject[]>('/projects/mine')).data,
  });

  return (
    <>
      <PageHeader
        title="My projects"
        description="Where you're placed, and who you're working alongside. This view is read-only."
      />

      {isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <CardSkeleton count={2} />
      ) : !data.length ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="You're not on a project yet"
            description="Once a manager places you on one, it appears here with the modules you're working on and the people alongside you."
          />
        </Card>
      ) : (
        <motion.div variants={listVariants} initial="initial" animate="animate" className="space-y-5">
          {data.map((p) => (
            <motion.div key={p.project.id} variants={itemVariants}>
              <Card>
                <CardHeader
                  title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {p.project.name}
                      <span className="text-muted font-mono text-[12.5px]">{p.project.code}</span>
                      <StatusPill status={p.project.status} />
                    </span>
                  }
                  description={
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span>{p.project.client.name}</span>
                      {p.project.startDate && (
                        <>
                          <span className="text-muted">·</span>
                          <span>Started {fmtDate(p.project.startDate)}</span>
                        </>
                      )}
                      {p.project.endDate && (
                        <>
                          <span className="text-muted">·</span>
                          <span>Ends {fmtDate(p.project.endDate)}</span>
                        </>
                      )}
                    </span>
                  }
                />
                <CardBody className="space-y-5 pt-0">
                  {p.project.description && (
                    <p className="text-secondary text-[13px] leading-relaxed">{p.project.description}</p>
                  )}

                  {/* Their own placements first — the answer to "what am I on?" */}
                  <section>
                    <SectionLabel>
                      Your placement{p.myPlacements.length === 1 ? '' : 's'} · {p.totalAllocation}% of your time
                    </SectionLabel>
                    <ul className="flex flex-wrap gap-2">
                      {p.myPlacements.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-xl border bg-[color:var(--surface-sunken)] px-3 py-2 text-[12.5px]"
                        >
                          <span className="font-medium">
                            {a.subModule
                              ? `${a.module?.name} › ${a.subModule.name}`
                              : a.module?.name ?? 'Whole project'}
                          </span>
                          {a.roleOnProject && <span className="text-secondary"> · {a.roleOnProject}</span>}
                          <span className="text-muted tnum"> · {a.allocationPct}%</span>
                          {(a.startDate || a.endDate) && (
                            <span className="text-muted">
                              {' · '}
                              {fmtDate(a.startDate)} – {a.endDate ? fmtDate(a.endDate) : 'ongoing'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>

                  {/* One group per module they're on, with the people sharing it. */}
                  {p.scopes.map((sc) => (
                    <section key={sc.module?.id ?? 'project'}>
                      <SectionLabel>
                        <span className="inline-flex items-center gap-1.5">
                          {sc.kind === 'MODULE' ? (
                            <Layers className="h-3 w-3" />
                          ) : (
                            <Users2 className="h-3 w-3" />
                          )}
                          {sc.kind === 'MODULE' ? sc.module?.name : 'Across the whole project'}
                          <span className="text-muted font-normal normal-case">
                            · {sc.members.length} {sc.members.length === 1 ? 'person' : 'people'}
                          </span>
                        </span>
                      </SectionLabel>

                      {sc.module?.description && (
                        <p className="text-muted mb-2 text-[12px] leading-relaxed">{sc.module.description}</p>
                      )}

                      {!!sc.subModules.length && (
                        <p className="text-muted mb-2.5 text-[12px]">
                          Sub-modules: {sc.subModules.map((sm) => sm.name).join(' · ')}
                        </p>
                      )}

                      <MemberList members={sc.members} />
                    </section>
                  ))}

                  {/* Not peers on a module, but they work across everything. */}
                  {!!p.alsoOnProject.length && (
                    <section>
                      <SectionLabel>
                        Also on this project
                        <span className="text-muted font-normal normal-case">
                          {' '}
                          · not scoped to a module
                        </span>
                      </SectionLabel>
                      <MemberList members={p.alsoOnProject} />
                    </section>
                  )}
                </CardBody>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">{children}</p>
  );
}

function MemberList({ members }: { members: MyProjectMember[] }) {
  if (!members.length) {
    return (
      <p className="text-muted rounded-lg bg-[color:var(--surface-sunken)] px-3 py-4 text-center text-[12.5px]">
        Nobody else placed here yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => (
        <li
          key={m.resourceId + m.scopeLabel}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border px-3 py-2.5',
            m.isMe && 'border-brand-500/45 bg-brand-500/[0.055]',
          )}
        >
          <Avatar name={m.name} color={m.avatarColor} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">
              {m.name}
              {m.isMe && <span className="text-brand-700 dark:text-brand-300"> · you</span>}
            </p>
            <p className="text-muted mt-0.5 truncate text-[12px]">
              {m.roleOnProject ?? m.designation ?? 'No title'}
            </p>
          </div>
          <StatusPill
            status={m.type}
            label={m.type === 'SH' ? 'Internal' : m.serviceProvider?.name ?? 'External'}
            dot={false}
            animateChange={false}
          />
        </li>
      ))}
    </ul>
  );
}
