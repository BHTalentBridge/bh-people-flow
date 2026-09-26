import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, Layers, Pencil, Plus, Trash2, Users2, UserCog, ChevronRight, Check, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { ProjectFormModal } from './Projects';
import { ModuleDetailModal } from '@/features/ModuleDetailModal';
import { AssignResourceModal } from '@/features/AssignResourceModal';
import { ProjectResourceModal } from '@/features/ProjectResourceModal';
import { fmtDate, ROLE_LABEL } from '@/lib/format';
import { itemVariants, listVariants, panelVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';
import type { ClientRef, Project, ProjectResource, UserRef } from '@/lib/types';

type Tab = 'structure' | 'people';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('structure');
  const [editOpen, setEditOpen] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [engineersOpen, setEngineersOpen] = useState(false);
  const [moduleOpen, setModuleOpen] = useState(false);
  const [subModuleFor, setSubModuleFor] = useState<{ id: string; name: string } | null>(null);
  const [deleteModule, setDeleteModule] = useState<{ id: string; name: string } | null>(null);
  // Drill-downs open in place rather than navigating away.
  const [drill, setDrill] = useState<{ kind: 'module' | 'subModule'; id: string; name: string } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => (await api.get<Project>(`/projects/${id}`)).data,
    enabled: !!id,
  });

  // One entry per person, carrying all their placements.
  const { data: people = [] } = useQuery({
    queryKey: ['project-resources', id],
    queryFn: async () => (await api.get<ProjectResource[]>(`/projects/${id}/resources`)).data,
    enabled: !!id,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['client-options'],
    queryFn: async () => (await api.get<ClientRef[]>('/clients/options')).data,
  });

  const removeModule = useMutation({
    mutationFn: (moduleId: string) => api.delete(`/projects/modules/${moduleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      setDeleteModule(null);
      toast.success('Module deleted');
    },
    onError: (e) => { toastError(e); setDeleteModule(null); },
  });

  const removeSubModule = useMutation({
    mutationFn: (subId: string) => api.delete(`/projects/sub-modules/${subId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Sub-module deleted');
    },
    onError: toastError,
  });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (error || !project) return <ErrorState message="Couldn't load this project." />;

  const engineers = project.engineers ?? [];
  const pendingRequests = project.requests ?? [];
  // Computed server-side, so the rule lives in ScopeService alone rather than
  // being re-derived here and drifting.
  const needsApproval = !!project.needsAssignmentApproval;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/projects" className="text-muted inline-flex items-center gap-1.5 text-[13px] hover:text-[color:var(--text-primary)]">
            <ArrowLeft className="h-3.5 w-3.5" /> Projects
          </Link>
        }
        title={project.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-[12.5px]">{project.code}</span>
            <span className="text-muted">·</span>
            <span>{project.client.name}</span>
            {project.startDate && (
              <>
                <span className="text-muted">·</span>
                <span>Started {fmtDate(project.startDate)}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <StatusPill status={project.status} />
            {user?.role === 'ADMIN' && (
              <>
                <Button onClick={() => setManagersOpen(true)}>
                  <UserCog className="h-4 w-4" /> Project Managers
                </Button>
                <Button onClick={() => setEngineersOpen(true)}>
                  <ShieldCheck className="h-4 w-4" /> Engineering Managers
                </Button>
              </>
            )}
            <Button variant="primary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Modules" value={project.modules?.length ?? 0} />
        <Metric label="Headcount" value={project.headcount ?? 0} sub={`${project.resourceMix?.internal ?? 0} internal · ${project.resourceMix?.external ?? 0} external`} />
        <Metric label="Tasks" value={project._count?.tasks ?? 0} />
      </div>

      <Card className="mb-5">
        <CardBody className="py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">
                Project Managers
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!project.managers.length ? (
                  <span className="text-muted text-[13px]">No Project Manager assigned</span>
                ) : (
                  project.managers.map((m) => (
                    <span key={m.user.id} className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1">
                      <Avatar name={m.user.name} color={m.user.avatarColor} size="xs" />
                      <span className="text-[12.5px] font-medium">{m.user.name}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">
                Engineering Managers
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!engineers.length ? (
                  // Not an error state — it just means the fallback applies.
                  <span className="text-muted text-[13px]">
                    None — resource requests go to an Admin instead
                  </span>
                ) : (
                  engineers.map((e) => (
                    <span key={e.user.id} className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1">
                      <Avatar name={e.user.name} color={e.user.avatarColor} size="xs" />
                      <span className="text-[12.5px] font-medium">{e.user.name}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
            {project.description && (
              <p className="text-secondary max-w-xl flex-1 text-[13px] leading-relaxed">{project.description}</p>
            )}
          </div>
        </CardBody>
      </Card>

      <Tabs
        tabs={[
          { value: 'structure', label: 'Modules', count: project.modules?.length },
          { value: 'people', label: 'Assigned resources', count: people.length },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-5"
        idPrefix="project"
      />

      {/* Enter-only: see panelVariants. Switching tabs must never wait on the
          previous panel animating out. */}
      <motion.div key={tab} variants={panelVariants} initial="initial" animate="animate">
          {tab === 'structure' && (
            <Card>
              <CardHeader
                title="Modules and sub-modules"
                description="How the project is broken down — used to scope who works on what."
                action={<Button size="sm" onClick={() => setModuleOpen(true)}><Plus className="h-3.5 w-3.5" /> Add module</Button>}
              />
              <CardBody className="pt-0">
                {!project.modules?.length ? (
                  <EmptyState
                    icon={Layers}
                    title="No modules yet"
                    description="Break the project into modules (e.g. AIMS, ARMS), then add sub-modules under each."
                    action={<Button variant="primary" onClick={() => setModuleOpen(true)}><Plus className="h-4 w-4" /> Add module</Button>}
                  />
                ) : (
                  <motion.div variants={listVariants} initial="initial" animate="animate" className="space-y-3">
                    <AnimatePresence initial={false}>
                      {project.modules.map((m) => (
                        <motion.div
                          key={m.id}
                          variants={itemVariants}
                          exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                          className="overflow-hidden rounded-xl border"
                        >
                          <div className="flex items-center gap-3 bg-[color:var(--surface-sunken)] px-4 py-2.5">
                            <Layers className="text-muted h-4 w-4 shrink-0" />
                            <button
                              onClick={() => setDrill({ kind: 'module', id: m.id, name: m.name })}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="truncate text-[13.5px] font-semibold hover:underline">{m.name}</p>
                              {m.description && <p className="text-muted truncate text-[12px]">{m.description}</p>}
                            </button>
                            <span className="text-muted tnum hidden text-[12px] sm:inline">
                              {m._count?.assignments ?? 0} assigned · {m._count?.tasks ?? 0} tasks
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => setSubModuleFor({ id: m.id, name: m.name })}>
                              <Plus className="h-3.5 w-3.5" /> Sub-module
                            </Button>
                            <Button size="icon" variant="ghost" className="hover:text-red-600" aria-label="Delete module" onClick={() => setDeleteModule({ id: m.id, name: m.name })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          {!m.subModules.length ? (
                            <p className="text-muted px-4 py-3 text-[12.5px]">No sub-modules yet.</p>
                          ) : (
                            <ul className="divide-y">
                              <AnimatePresence initial={false}>
                                {m.subModules.map((s) => (
                                  <motion.li
                                    key={s.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="flex items-center gap-2.5 overflow-hidden px-4 py-2.5"
                                  >
                                    <ChevronRight className="text-muted h-3.5 w-3.5 shrink-0" />
                                    <button
                                      onClick={() => setDrill({ kind: 'subModule', id: s.id, name: s.name })}
                                      className="min-w-0 flex-1 truncate text-left text-[13px] hover:underline"
                                    >
                                      {s.name}
                                    </button>
                                    <span className="text-muted tnum text-[12px]">
                                      {s._count?.assignments ?? 0} assigned
                                    </span>
                                    <Button size="icon" variant="ghost" className="hover:text-red-600" aria-label="Delete sub-module" onClick={() => removeSubModule.mutate(s.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </motion.li>
                                ))}
                              </AnimatePresence>
                            </ul>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </CardBody>
            </Card>
          )}

          {tab === 'people' && (
            <Card>
              <CardHeader
                title="Assigned resources"
                description="Who is placed on this project, and on which part of it."
                action={
                  <Button size="sm" onClick={() => setAssignOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> {needsApproval ? 'Request resource' : 'Assign resource'}
                  </Button>
                }
              />
              <CardBody className="pt-0">
                {/* Requested but not yet approved. Deliberately outside the list
                    below — these people are not on the project, and the roster
                    would be lying if it showed them there. */}
                {!!pendingRequests.length && (
                  <div className="mb-4 rounded-xl bg-amber-500/[0.06] px-3.5 py-3 ring-1 ring-inset ring-amber-500/20">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-[13px] font-medium">
                        {pendingRequests.length} awaiting approval
                      </p>
                      <Link
                        to={`/assignment-requests?status=PENDING&projectId=${project.id}`}
                        className="text-muted ml-auto text-[12.5px] hover:text-[color:var(--text-primary)] hover:underline"
                      >
                        Open queue
                      </Link>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {pendingRequests.map((r) => (
                        <li key={r.id} className="text-secondary text-[12.5px]">
                          <span className="text-[color:var(--text-primary)] font-medium">
                            {r.resource.name}
                          </span>{' '}
                          · {r.module ? [r.module.name, r.subModule?.name].filter(Boolean).join(' › ') : 'Whole project'}{' '}
                          · {r.allocationPct}% · requested by {r.requestedBy.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!people.length ? (
                  <EmptyState
                    icon={Users2}
                    title="Nobody assigned yet"
                    description="Place someone on the project to record who is working on it, on what, and for how much of their time."
                    action={
                      <Button variant="primary" onClick={() => setAssignOpen(true)}>
                        <Plus className="h-4 w-4" /> {needsApproval ? 'Request resource' : 'Assign resource'}
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y">
                    {people.map((e) => {
                      // Each person appears once; their placements are summarised here
                      // and listed in full when the row is opened.
                      const scopes = e.assignments.map((a) =>
                        a.subModule
                          ? `${a.module?.name} › ${a.subModule.name}`
                          : a.module?.name ?? 'Whole project',
                      );
                      const roles = [
                        ...new Set(e.assignments.map((a) => a.roleOnProject).filter(Boolean)),
                      ] as string[];
                      return (
                        <li key={e.resource.id}>
                          <button
                            onClick={() => setPersonId(e.resource.id)}
                            className="-mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors duration-150 hover:bg-[color:var(--surface-hover)]"
                          >
                            <Avatar name={e.resource.name} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-medium">{e.resource.name}</p>
                              <p className="text-muted mt-0.5 truncate text-[12px]">
                                {/* Role here first — it's more relevant on a project page
                                    than their company-wide designation. */}
                                {roles.length ? roles.join(' · ') : e.resource.designation ?? '—'}
                                {' · '}{scopes.join(' · ')}
                              </p>
                            </div>
                            {e.assignments.length > 1 && (
                              <span className="text-muted rounded bg-[color:var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px] font-medium">
                                {e.assignments.length} placements
                              </span>
                            )}
                            {e.totalAllocation !== 100 && (
                              <span className="text-muted tnum text-[12px]">{e.totalAllocation}%</span>
                            )}
                            <StatusPill
                              status={e.resource.type}
                              label={e.resource.type === 'SH' ? 'Internal' : e.resource.serviceProvider?.name ?? 'External'}
                              dot={false}
                              animateChange={false}
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
      </motion.div>

      <ProjectResourceModal
        entry={people.find((e) => e.resource.id === personId) ?? null}
        projectCode={project.code}
        onClose={() => setPersonId(null)}
      />
      <ModuleDetailModal
        target={drill}
        onClose={() => setDrill(null)}
        onOpenSubModule={(sm) => setDrill({ kind: 'subModule', id: sm.id, name: sm.name })}
      />
      <AssignResourceModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        projectId={project.id}
        projectCode={project.code}
        modules={project.modules ?? []}
        needsApproval={needsApproval}
        approverNames={project.approverNames ?? []}
      />

      <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} clients={clients} project={project} />
      <ProjectPeopleModal
        kind="managers"
        open={managersOpen}
        onClose={() => setManagersOpen(false)}
        project={project}
      />
      <ProjectPeopleModal
        kind="engineers"
        open={engineersOpen}
        onClose={() => setEngineersOpen(false)}
        project={project}
      />
      <ModuleModal open={moduleOpen} onClose={() => setModuleOpen(false)} projectId={project.id} />
      <SubModuleModal open={!!subModuleFor} onClose={() => setSubModuleFor(null)} module={subModuleFor} projectId={project.id} />

      <ConfirmDialog
        open={!!deleteModule}
        onClose={() => setDeleteModule(null)}
        onConfirm={() => deleteModule && removeModule.mutate(deleteModule.id)}
        loading={removeModule.isPending}
        title="Delete this module?"
        message={<>Deleting <strong>{deleteModule?.name}</strong> removes its sub-modules and unlinks any assignments made against it.</>}
      />
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="surface rounded-[var(--radius-card)] px-4 py-3.5">
      <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">{label}</p>
      <p className="tnum mt-1.5 text-[24px] leading-none font-semibold">{value}</p>
      {sub && <p className="text-secondary mt-2 text-[12px]">{sub}</p>}
    </div>
  );
}

function ModuleModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/modules`, { name, description: description || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-options'] });
      setName(''); setDescription('');
      toast.success('Module added');
      onClose();
    },
    onError: toastError,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a module"
      description="A major area of the project, e.g. AIMS or ARMS."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>Add module</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Module name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AIMS" autoFocus />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Aviation Information Management System" />
        </Field>
      </div>
    </Modal>
  );
}

function SubModuleModal({
  open, onClose, module, projectId,
}: {
  open: boolean; onClose: () => void; module: { id: string; name: string } | null; projectId: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => api.post(`/projects/modules/${module!.id}/sub-modules`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-options'] });
      setName('');
      toast.success('Sub-module added');
      onClose();
    },
    onError: toastError,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add a sub-module to ${module?.name ?? ''}`}
      description="e.g. Flight Scheduling, Flight Monitoring."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>Add sub-module</Button>
        </>
      }
    >
      <Field label="Sub-module name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Flight Scheduling" autoFocus />
      </Field>
    </Modal>
  );
}

/**
 * A project carries two kinds of manager, set the same way and both Admin-only:
 * **PMs**, who run the work, and **EMs**, who sign off which resources go on it.
 * One component, because the only thing that differs is which list it writes to.
 */
const PEOPLE_MODAL = {
  managers: {
    title: 'Project Managers',
    description:
      "Only people holding Project Manager access are listed — Admins aren't, since they already have full authority on every project. Several PMs can co-manage one, and reassigning them never disturbs the resources placed on it.",
    // Exact role. The endpoint returns only this role and the service re-checks it.
    optionsRole: 'PM' as string | undefined,
    endpoint: 'managers',
    payloadKey: 'managerIds',
    save: 'Save Project Managers',
    toast: 'Project Managers updated',
    toastDetail: 'Resources placed on this project are untouched.',
    empty: 'No Project Managers exist yet. Grant someone PM access on the Resources screen first.',
  },
  engineers: {
    title: 'Engineering Managers',
    description:
      'Only people holding Engineering Manager access are listed. EMs approve every resource a PM wants to place on this project, and decide leave for the people on it. With nobody here, both fall back to an Admin.',
    optionsRole: 'EM' as string | undefined,
    endpoint: 'engineers',
    payloadKey: 'engineerIds',
    save: 'Save Engineering Managers',
    toast: 'Engineering Managers updated',
    toastDetail: 'Pending requests on this project now route to them.',
    empty: 'No Engineering Managers exist yet. Grant someone EM access on the Resources screen first.',
  },
} as const;

function ProjectPeopleModal({
  kind,
  open,
  onClose,
  project,
}: {
  kind: keyof typeof PEOPLE_MODAL;
  open: boolean;
  onClose: () => void;
  project: Project;
}) {
  const qc = useQueryClient();
  const copy = PEOPLE_MODAL[kind];
  const current = kind === 'managers' ? project.managers : project.engineers ?? [];
  const [selected, setSelected] = useState<string[]>(current.map((m) => m.user.id));

  // Re-sync when the project reloads underneath an open modal.
  useEffect(() => {
    if (open) setSelected(current.map((m) => m.user.id));
  }, [open, project.id, kind]);

  const { data: people = [] } = useQuery({
    queryKey: ['manager-options', copy.optionsRole ?? 'PM'],
    queryFn: async () =>
      (await api.get<UserRef[]>('/users/managers', {
        params: copy.optionsRole ? { role: copy.optionsRole } : undefined,
      })).data,
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      api.put(`/projects/${project.id}/${copy.endpoint}`, { [copy.payloadKey]: selected }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['assignment-requests'] });
      qc.invalidateQueries({ queryKey: ['assignment-pending-count'] });
      toast.success(copy.toast, { description: copy.toastDetail });
      onClose();
    },
    onError: toastError,
  });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            {copy.save}
          </Button>
        </>
      }
    >
      {!people.length ? (
        <EmptyState icon={UserCog} title="Nobody to pick" description={copy.empty} />
      ) : (
        <ul className="space-y-1.5">
          {people.map((m) => {
            const on = selected.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  onClick={() => toggle(m.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
                    'transition-colors duration-150 hover:bg-[color:var(--surface-hover)]',
                    on && 'border-brand-500/45 bg-brand-500/[0.055]',
                  )}
                >
                  <Avatar name={m.name} color={m.avatarColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{m.name}</p>
                    <p className="text-muted truncate text-[12px]">
                      {m.resource?.designation ? `${m.resource.designation} · ` : ''}
                      {m.email}
                    </p>
                  </div>
                  {/* Named on every row, so there's no doubt which list this is. */}
                  {m.role && (
                    <StatusPill
                      tone={m.role === 'EM' ? 'violet' : 'blue'}
                      label={ROLE_LABEL[m.role]}
                      dot={false}
                      animateChange={false}
                    />
                  )}
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md border transition-colors duration-150',
                      on ? 'bg-brand-600 border-brand-600 text-white' : 'border-[color:var(--border-strong)]',
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
