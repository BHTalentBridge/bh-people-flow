import { Layers, ListChecks, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { fmtDate } from '@/lib/format';
import { invalidatePlacements } from '@/lib/invalidate';
import { useState } from 'react';
import type { ProjectResource } from '@/lib/types';

/**
 * Everything one person is doing on this project: every module/sub-module
 * placement and their workload — so the list can show
 * each person once instead of one row per assignment.
 */
export function ProjectResourceModal({
  entry,
  projectCode,
  onClose,
}: {
  entry: ProjectResource | null;
  projectCode: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);

  const unassign = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/resources/${entry!.resource.id}/assignments/${assignmentId}`),
    onSuccess: () => {
      invalidatePlacements(qc);
      setRemoving(null);
      toast.success('Placement removed');
      // Removing their last placement removes them from the project entirely.
      if (entry && entry.assignments.length <= 1) onClose();
    },
    onError: (e) => { toastError(e); setRemoving(null); },
  });

  const r = entry?.resource;

  return (
    <>
      <Modal
        open={!!entry}
        onClose={onClose}
        title={
          r ? (
            <span className="inline-flex items-center gap-2.5">
              <Avatar name={r.name} size="sm" />
              {r.name}
            </span>
          ) : (
            'Resource'
          )
        }
        description={
          r
            ? `${r.employeeCode ?? ''}${r.designation ? ` · ${r.designation}` : ''} · on ${projectCode}`
            : undefined
        }
        size="lg"
        footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
      >
        {!entry || !r ? null : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                status={r.type}
                label={r.type === 'SH' ? 'Internal' : r.serviceProvider?.name ?? 'External'}
                dot={false}
                animateChange={false}
              />
              <StatusPill status={r.status} dot={false} animateChange={false} />
              <span className="text-muted text-[12.5px]">
                {entry.totalAllocation}% allocated on this project
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Metric label="Placements" value={entry.assignments.length} />
              <Metric
                label="Open tasks"
                value={entry.tasks.open}
                sub={entry.tasks.overdue ? `${entry.tasks.overdue} overdue` : undefined}
                tone={entry.tasks.overdue ? 'red' : undefined}
              />
            </div>

            <Section title={`Working on (${entry.assignments.length})`}>
              <ul className="divide-y">
                {entry.assignments.map((a) => {
                  const label = a.subModule
                    ? `${a.module?.name} › ${a.subModule.name}`
                    : a.module?.name ?? 'Whole project';
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <Layers className="text-muted h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{label}</p>
                        {(a.startDate || a.endDate) && (
                          <p className="text-muted mt-0.5 text-[11.5px]">
                            {fmtDate(a.startDate)} – {a.endDate ? fmtDate(a.endDate) : 'ongoing'}
                          </p>
                        )}
                      </div>
                      {/* What they do *here* — distinct from their company-wide designation. */}
                      {a.roleOnProject && (
                        <StatusPill
                          tone={r.type === 'SH' ? 'blue' : 'violet'}
                          label={a.roleOnProject}
                          dot={false}
                          animateChange={false}
                        />
                      )}
                      <span className="text-muted tnum text-[12.5px]">{a.allocationPct}%</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${label}`}
                        className="hover:text-red-600"
                        onClick={() => setRemoving({ id: a.id, label })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Section>


            <Section title="Workload on this project">
              <div className="text-secondary flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
                <span className="inline-flex items-center gap-1.5">
                  <ListChecks className="text-muted h-3.5 w-3.5" />
                  {entry.tasks.total} task{entry.tasks.total === 1 ? '' : 's'} total
                </span>
                <span>{entry.tasks.open} open</span>
                {entry.tasks.overdue > 0 && (
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {entry.tasks.overdue} overdue
                  </span>
                )}
              </div>
            </Section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && unassign.mutate(removing.id)}
        loading={unassign.isPending}
        title="Remove this placement?"
        message={
          entry && entry.assignments.length <= 1 ? (
            <>
              <strong>{r?.name}</strong> has no other placement on this project, so removing{' '}
              <strong>{removing?.label}</strong> takes them off the project entirely. Their
              membership here would then be invalid.
            </>
          ) : (
            <>
              Removes <strong>{r?.name}</strong> from <strong>{removing?.label}</strong>. Their
              other placements on this project stay.
            </>
          )
        }
        confirmLabel="Remove placement"
      />
    </>
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

function Metric({
  label, value, sub, tone,
}: {
  label: string; value: number; sub?: string; tone?: 'red';
}) {
  return (
    <div className="rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2.5 text-center">
      <p className="tnum text-[20px] leading-none font-semibold">{value}</p>
      <p className="text-muted mt-1.5 text-[11px]">{label}</p>
      {sub && (
        <p className={tone === 'red' ? 'mt-0.5 text-[11px] text-red-600 dark:text-red-400' : 'text-muted mt-0.5 text-[11px]'}>
          {sub}
        </p>
      )}
    </div>
  );
}
