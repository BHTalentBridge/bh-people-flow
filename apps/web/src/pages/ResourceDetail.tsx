import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Award, Briefcase, Building2, Mail, MapPin, Pencil, Phone, Plus, ShieldCheck, Trash2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, Select, Input, Textarea } from '@/components/ui/Field';
import { ResourceFormModal } from '@/features/ResourceFormModal';
import { fmtDate, FUNCTION_LABEL, ROLE_LABEL } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import { invalidatePlacements } from '@/lib/invalidate';
import type { Assignment, ResourceRow } from '@/lib/types';

interface ProjectOption {
  /** Server's answer for this caller: does placing someone here need sign-off? */
  needsAssignmentApproval?: boolean;
  approverNames?: string[];
  id: string; name: string; code: string;
  modules: { id: string; name: string; subModules: { id: string; name: string }[] }[];
}

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const { data: resource, isLoading, error } = useQuery({
    queryKey: ['resource', id],
    queryFn: async () => (await api.get<ResourceRow>(`/resources/${id}`)).data,
    enabled: !!id,
  });

  const unassign = useMutation({
    mutationFn: (assignmentId: string) => api.delete(`/resources/${id}/assignments/${assignmentId}`),
    onSuccess: () => {
      invalidatePlacements(qc);
      setRemoving(null);
      toast.success('Placement removed');
    },
    onError: (e) => { toastError(e); setRemoving(null); },
  });

  // Managers aren't placed on projects — they're attached as a project's PM or
  // EM, and an Admin oversees every project already. Mirrors the server rule in
  // AssignmentsService.validatePlacement.
  const elevated = resource?.user?.role && resource.user.role !== 'RESOURCE';

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !resource) return <ErrorState message="Couldn't load this resource." />;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/resources" className="text-muted inline-flex items-center gap-1.5 text-[13px] hover:text-[color:var(--text-primary)]">
            <ArrowLeft className="h-3.5 w-3.5" /> Resources
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={resource.name} size="lg" />
            {resource.name}
          </span>
        }
        description={`${resource.employeeCode} · ${resource.designation ?? 'No title set'}`}
        actions={
          <>
            <Button variant="primary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="pt-0">
            <dl className="space-y-3 text-[13px]">
              <Row icon={Mail} label="Email" value={resource.email} />
              {resource.phone && <Row icon={Phone} label="Phone" value={resource.phone} />}
              {resource.jobFunction && (
                <Row icon={Briefcase} label="Function" value={FUNCTION_LABEL[resource.jobFunction]} />
              )}
              {resource.location && <Row icon={MapPin} label="Location" value={resource.location} />}
              {resource.joinedAt && <Row icon={CalendarDays} label="Joined" value={fmtDate(resource.joinedAt)} />}
              {resource.serviceProvider && <Row icon={Building2} label="Service provider" value={resource.serviceProvider.name} />}
              {resource.internalSeniority && (
                <Row icon={Award} label="Internal seniority" value={resource.internalSeniority} />
              )}
            </dl>

            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <StatusPill status={resource.type} label={resource.type === 'SH' ? 'Internal (SH)' : 'External'} dot={false} />
              <StatusPill status={resource.status} dot={false} />
              {resource.type === 'SH' && (
                <StatusPill tone="green" status="INVOICING" label="Invoicing enabled" dot={false} animateChange={false} />
              )}
            </div>

            {resource.createdBy && (
              <p className="text-muted mt-4 text-[12px]">
                Onboarded by {resource.createdBy.name}
              </p>
            )}
            {resource.notes && (
              <p className="text-secondary mt-3 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2.5 text-[12.5px] leading-relaxed">
                {resource.notes}
              </p>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Project assignments"
            description="Which projects, modules and sub-modules this resource works on."
            action={
              elevated ? undefined : (
                <Button size="sm" onClick={() => setAssignOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Assign
                </Button>
              )
            }
          />
          <CardBody className="pt-0">
            {!resource.assignments?.length ? (
              <EmptyState
                icon={Building2}
                title={elevated ? 'Not placed on projects' : 'Not assigned yet'}
                description={
                  elevated
                    ? `${ROLE_LABEL[resource.user!.role!]}s aren't placed on projects as resources — they're attached to a project from its own page, under Project Managers or Engineering Managers.`
                    : 'This resource is on the bench. Assign them to a project or module to get started.'
                }
                action={
                  elevated ? undefined : (
                    <Button variant="primary" onClick={() => setAssignOpen(true)}>
                      <Plus className="h-4 w-4" /> Assign to project
                    </Button>
                  )
                }
              />
            ) : (
              <motion.ul variants={listVariants} initial="initial" animate="animate" className="divide-y">
                <AnimatePresence initial={false}>
                  {resource.assignments.map((a) => (
                    <motion.li
                      key={a.id}
                      variants={itemVariants}
                      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                      className="flex items-center gap-3 overflow-hidden py-3 first:pt-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">
                          <Link to={`/projects/${a.project.id}`} className="hover:underline">
                            {a.project.name}
                          </Link>
                        </p>
                        <p className="text-muted mt-0.5 truncate text-[12px]">
                          {a.project.code}
                          {a.module && ` › ${a.module.name}`}
                          {a.subModule && ` › ${a.subModule.name}`}
                          {a.allocationPct < 100 && ` · ${a.allocationPct}% allocated`}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove assignment"
                        className="hover:text-red-600"
                        onClick={() => setRemoving(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </CardBody>
        </Card>
      </div>


      <ResourceFormModal open={editOpen} onClose={() => setEditOpen(false)} resource={resource} />
      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        resourceId={resource.id}
        held={resource.assignments ?? []}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && unassign.mutate(removing)}
        loading={unassign.isPending}
        title="Remove this assignment?"
        message="The resource stays in the system — they're just taken off this project/module."
        confirmLabel="Remove"
      />
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="text-muted mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-muted text-[11px] tracking-wide uppercase">{label}</dt>
        <dd className="mt-0.5 truncate">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Placing one person on a project.
 *
 * Every project stays in the list even if they're already on it — a second
 * placement on a *different* module is legitimate. What's blocked is the exact
 * duplicate, so those options are disabled rather than left to fail on submit.
 */
function AssignModal({
  open,
  onClose,
  resourceId,
  held,
}: {
  open: boolean;
  onClose: () => void;
  resourceId: string;
  /** Placements this person already holds, across all projects. */
  held: Assignment[];
}) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [subModuleId, setSubModuleId] = useState('');
  const [allocationPct, setAllocationPct] = useState('100');
  const [roleOnProject, setRoleOnProject] = useState('');
  const [reason, setReason] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['project-options'],
    queryFn: async () => (await api.get<ProjectOption[]>('/projects/options')).data,
    enabled: open,
  });

  const project = projects.find((p) => p.id === projectId);
  const module = project?.modules.find((m) => m.id === moduleId);

  const assign = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ pending: boolean }>(
        `/resources/${resourceId}/assignments`,
        {
          projectId,
          moduleId: moduleId || undefined,
          subModuleId: subModuleId || undefined,
          roleOnProject: roleOnProject.trim() || undefined,
          allocationPct: Number(allocationPct) || 100,
          reason: reason.trim() || undefined,
        },
      );
      return data;
    },
    onSuccess: (data) => {
      invalidatePlacements(qc);
      // Say what actually happened. A PM's placement is a request until an EM
      // decides it, and claiming otherwise was the bug here.
      toast.success(
        data?.pending
          ? 'Sent for approval'
          : `Assigned to ${project?.code ?? 'the project'}`,
        data?.pending
          ? { description: 'They join the project once the Engineering Manager signs off.' }
          : undefined,
      );
      setProjectId(''); setModuleId(''); setSubModuleId(''); setRoleOnProject(''); setReason('');
      onClose();
    },
    onError: toastError,
  });

  // Server-computed per project, so this can't drift from the real rule.
  const needsApproval = !!project?.needsAssignmentApproval;

  // What they already hold, so the form can't offer a duplicate.
  const heldOnProject = held.filter((a) => a.projectId === projectId);
  const takenWholeProject = heldOnProject.some((a) => !a.moduleId);
  const takenModule = (mid: string) =>
    heldOnProject.some((a) => a.moduleId === mid && !a.subModuleId);
  const takenSubModule = (smid: string) => heldOnProject.some((a) => a.subModuleId === smid);
  const heldCount = (pid: string) => held.filter((a) => a.projectId === pid).length;

  const duplicate = subModuleId
    ? takenSubModule(subModuleId)
    : moduleId
      ? takenModule(moduleId)
      : !!projectId && takenWholeProject;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={needsApproval ? 'Request a project placement' : 'Assign to a project'}
      description={
        needsApproval
          ? "The Engineering Manager signs off before they join. Narrow to a module to record exactly what they'd work on."
          : "Narrow to a module or sub-module to record exactly what they're working on."
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!projectId || duplicate} loading={assign.isPending} onClick={() => assign.mutate()}>
            {needsApproval ? <ShieldCheck className="h-4 w-4" /> : null}
            {needsApproval ? 'Request placement' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {needsApproval && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/[0.07] px-3.5 py-3 ring-1 ring-inset ring-amber-500/20">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[13px] leading-relaxed">
              <span className="font-medium">Needs approval.</span>{' '}
              {project?.approverNames?.length
                ? `${project.approverNames.join(' or ')} decides this one.`
                : 'An Admin decides this one — the project has no Engineering Manager yet.'}
            </p>
          </div>
        )}

        {!!heldOnProject.length && (
          <p className="text-secondary rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2.5 text-[12.5px] leading-relaxed">
            Already on this project:{' '}
            <span className="font-medium">
              {heldOnProject
                .map((a) =>
                  a.subModule ? `${a.module?.name} › ${a.subModule.name}` : a.module?.name ?? 'Whole project',
                )
                .join(', ')}
            </span>
            . Pick a different part to add another placement.
          </p>
        )}

        <Field label="Project" required>
          <Select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setModuleId(''); setSubModuleId(''); }}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => {
              const n = heldCount(p.id);
              return (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                  {n ? ` (already on ${n})` : ''}
                </option>
              );
            })}
          </Select>
        </Field>

        {!!project?.modules.length && (
          <Field
            label="Module"
            hint="Whole project = works across it, not tied to one part. A module scopes them to that part only."
          >
            <Select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubModuleId(''); }}>
              <option value="" disabled={takenWholeProject}>
                Whole project{takenWholeProject ? ' — already placed' : ''}
              </option>
              {project.modules.map((m) => (
                <option key={m.id} value={m.id} disabled={takenModule(m.id)}>
                  {m.name}{takenModule(m.id) ? ' — already placed' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {!!module?.subModules.length && (
          <Field label="Sub-module">
            <Select value={subModuleId} onChange={(e) => setSubModuleId(e.target.value)}>
              <option value="">Whole module</option>
              {module.subModules.map((sm) => (
                <option key={sm.id} value={sm.id} disabled={takenSubModule(sm.id)}>
                  {sm.name}{takenSubModule(sm.id) ? ' — already placed' : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Role on this project"
          hint="Optional. What they do here — separate from their company-wide designation."
        >
          <Input
            value={roleOnProject}
            onChange={(e) => setRoleOnProject(e.target.value)}
            placeholder="e.g. Tech Lead"
            maxLength={120}
          />
        </Field>

        <Field label="Allocation" hint="Percentage of their time on this assignment.">
          <Input type="number" min={1} max={100} value={allocationPct} onChange={(e) => setAllocationPct(e.target.value)} />
        </Field>

        {needsApproval && (
          <Field
            label="Why do you need them?"
            hint="Optional, but it's what the Engineering Manager reads before deciding."
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Alerting has no QA coverage and goes to UAT in three weeks."
              rows={2}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
