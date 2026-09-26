import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ListChecks, Plus, ExternalLink, GitPullRequest, Pencil, Trash2, LayoutGrid, Rows3, History,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, extractMessage, toastError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, TableSkeleton } from '@/components/ui/States';
import { fmtDate, fmtDateTime, humanise, SEVERITIES, SEVERITY_LABEL } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';
import type { Task, TaskStatus, UserRef } from '@/lib/types';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
const COLUMN_ACCENT: Record<TaskStatus, string> = {
  TODO: 'bg-slate-400',
  IN_PROGRESS: 'bg-sky-500',
  IN_REVIEW: 'bg-violet-500',
  BLOCKED: 'bg-red-500',
  DONE: 'bg-emerald-500',
};

interface ProjectOption {
  id: string; name: string; code: string;
  modules: { id: string; name: string; subModules: { id: string; name: string }[] }[];
}

export default function Tasks() {
  const { canManage, user } = useAuth();
  const qc = useQueryClient();
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);
  const view = (state.view as 'board' | 'table') ?? 'board';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [detail, setDetail] = useState<string | null>(state.taskId ?? null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  // Every status move goes through a prompt so a reason can be captured.
  const [moving, setMoving] = useState<{ task: Task; status: TaskStatus } | null>(null);
  const [exporting, setExporting] = useState(false);

  const params = clean({
    page: state.page,
    pageSize: view === 'board' ? 200 : 25,
    search,
    status: state.status,
    priority: state.priority,
    severity: state.severity,
    projectId: state.projectId,
    assigneeId: state.assigneeId,
    overdue: state.overdue,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
  });

  /**
   * Downloads the current view as .xlsx, with the same filters the table is
   * showing. Goes through axios so the auth header is sent — a plain link
   * would be rejected — and paging is dropped so you get the whole filtered
   * set, not just the page on screen.
   */
  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { page: _page, pageSize: _pageSize, ...filters } = params as Record<string, unknown>;
      const res = await api.get('/tasks/export', { params: filters, responseType: 'blob' });
      const name =
        /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ??
        `tasks-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Tasks exported', { description: name });
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => (await api.get<Paginated<Task>>('/tasks', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery({
    queryKey: ['task-stats', clean({ projectId: state.projectId })],
    queryFn: async () => (await api.get('/tasks/stats', { params: clean({ projectId: state.projectId }) })).data as {
      byStatus: Record<TaskStatus, number>; total: number; overdue: number;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['project-options'],
    queryFn: async () => (await api.get<ProjectOption[]>('/projects/options')).data,
  });

  const { data: assignees = [] } = useQuery({
    queryKey: ['assignee-options', state.projectId],
    queryFn: async () =>
      (await api.get<UserRef[]>('/tasks/assignee-options', { params: clean({ projectId: state.projectId }) })).data,
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: TaskStatus; note?: string }) =>
      api.patch(`/tasks/${id}/status`, { status, note: note || undefined }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-stats'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      setMoving(null);
      toast.success(`Moved to ${humanise(vars.status)}`, {
        description: vars.note ? `Reason: ${vars.note}` : undefined,
      });
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-stats'] });
      setDeleting(null);
      toast.success('Task deleted');
    },
    onError: (e) => { toastError(e); setDeleting(null); },
  });

  const activeCount = ['status', 'priority', 'severity', 'projectId', 'assigneeId', 'overdue'].filter((k) => state[k]).length;
  const sort = (key: string) => {
    const dir = state.sortBy === key && state.sortDir === 'asc' ? 'desc' : 'asc';
    set({ sortBy: key, sortDir: dir });
  };

  return (
    <>
      <PageHeader
        title={canManage ? 'Tasks' : 'My tasks'}
        description={
          canManage
            ? 'Local tracker mirroring the ticket system — ticket keys and merge requests are recorded here for visibility.'
            : 'Work assigned to you. Move a task along and the change is recorded in the audit trail.'
        }
        actions={
          <>
            <div className="flex rounded-lg bg-[color:var(--surface-sunken)] p-0.5">
              {([['board', LayoutGrid], ['table', Rows3]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => set({ view: v === 'board' ? undefined : v, page: undefined })}
                  aria-label={`${v} view`}
                  className={cn(
                    'relative rounded-[7px] px-2.5 py-1.5 transition-colors duration-150',
                    view === v ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]',
                  )}
                >
                  {view === v && (
                    <motion.span
                      layoutId="task-view"
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 rounded-[7px] bg-[color:var(--surface-card)] shadow-sm"
                    />
                  )}
                  <Icon className="relative h-4 w-4" />
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          </>
        }
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search title, description or Ticket ID…"
        activeCount={activeCount}
        onClear={() => { reset(); setSearchInput(''); }}
        actions={
          <Button onClick={exportXlsx} loading={exporting}>
            <Download className="h-4 w-4" /> Export to Excel
          </Button>
        }
        filters={
          <>
            <Field label="Status">
              <Select value={state.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
                <option value="">Any status</option>
                {STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={state.priority ?? ''} onChange={(e) => set({ priority: e.target.value })}>
                <option value="">Any priority</option>
                {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p} value={p}>{humanise(p)}</option>)}
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={state.severity ?? ''} onChange={(e) => set({ severity: e.target.value })}>
                <option value="">Any severity</option>
                {SEVERITIES.map((v) => <option key={v} value={v}>{SEVERITY_LABEL[v]}</option>)}
              </Select>
            </Field>
            <Field label="Project">
              <Select value={state.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value })}>
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </Select>
            </Field>
            {canManage && (
              <Field label="Assignee">
                <Select value={state.assigneeId ?? ''} onChange={(e) => set({ assigneeId: e.target.value })}>
                  <option value="">Anyone</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Due">
              <Select value={state.overdue ?? ''} onChange={(e) => set({ overdue: e.target.value })}>
                <option value="">Any</option>
                <option value="true">Overdue only</option>
              </Select>
            </Field>
          </>
        }
      />

      {/* Height is reserved whether or not the counts have arrived, so the table
          below doesn't jump down when they do. */}
      <div className="mb-4 flex min-h-[20px] flex-wrap items-center gap-2 text-[12.5px]">
        {stats && (
          <>
          <span className="text-muted">
            <span className="tnum font-semibold text-[color:var(--text-primary)]">{stats.total}</span> tasks
          </span>
          {stats.overdue > 0 && (
            <button
              onClick={() => set({ overdue: state.overdue ? undefined : 'true' })}
              className={cn(
                'rounded-full px-2 py-0.5 font-medium transition-colors duration-150',
                state.overdue
                  ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                  : 'bg-red-500/8 text-red-600 hover:bg-red-500/15 dark:text-red-400',
              )}
            >
              {stats.overdue} overdue
            </button>
          )}
          </>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No tasks match"
            description={activeCount || search ? 'Try loosening the filters.' : 'Create a task to start tracking work.'}
            action={<Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New task</Button>}
          />
        </Card>
      ) : view === 'board' ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {STATUSES.map((status) => {
            const items = data.items.filter((t) => t.status === status);
            return (
              <div key={status} className="min-w-0">
                <div className="mb-2.5 flex items-center gap-2 px-1">
                  <span className={cn('h-2 w-2 rounded-full', COLUMN_ACCENT[status])} />
                  <p className="text-[12.5px] font-semibold">{humanise(status)}</p>
                  <span className="text-muted tnum ml-auto text-[12px]">{items.length}</span>
                </div>
                <motion.div variants={listVariants} initial="initial" animate="animate" className="space-y-2.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {items.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onOpen={() => setDetail(t.id)}
                        onStatus={(s) => setMoving({ task: t, status: s })}
                      />
                    ))}
                  </AnimatePresence>
                  {!items.length && (
                    <div className="text-muted rounded-xl border border-dashed px-3 py-6 text-center text-[12px]">
                      Nothing here
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th sortKey="title" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Task</Th>
                <Th>Project</Th>
                {canManage && <Th>Assignee</Th>}
                <Th sortKey="priority" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Priority</Th>
                <Th>Severity</Th>
                <Th sortKey="dueDate" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Due</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE';
                  return (
                    <Tr key={t.id} onClick={() => setDetail(t.id)}>
                      <Td>
                        <p className="max-w-[280px] truncate text-[13.5px] font-medium">{t.title}</p>
                        <div className="text-muted mt-0.5 flex items-center gap-2 text-[11.5px]">
                          {t.ticketId && <span className="font-mono">{t.ticketId}</span>}
                          {t.mrUrl && <GitPullRequest className="h-3 w-3" />}
                        </div>
                      </Td>
                      <Td>
                        <p className="text-[12.5px] font-medium">{t.project.code}</p>
                        {t.module && <p className="text-muted mt-0.5 truncate text-[11.5px]">{t.module.name}</p>}
                      </Td>
                      {canManage && (
                        <Td>
                          <div className="flex items-center gap-2">
                            <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size="xs" />
                            <span className="truncate text-[12.5px]">{t.assignee.name}</span>
                          </div>
                        </Td>
                      )}
                      <Td><StatusPill status={t.priority} dot={false} animateChange={false} /></Td>
                      <Td>
                        {t.severity ? (
                          <StatusPill status={t.severity} label={SEVERITY_LABEL[t.severity]} dot={false} animateChange={false} />
                        ) : (
                          <span className="text-muted text-[12.5px]">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className={cn('text-[12.5px]', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
                          {t.dueDate ? fmtDate(t.dueDate, 'd MMM') : '—'}
                        </span>
                      </Td>
                      <Td onClick={(e: any) => e.stopPropagation()}>
                        <Select
                          value={t.status}
                          onChange={(e) => setMoving({ task: t, status: e.target.value as TaskStatus })}
                          className="h-8 w-auto min-w-[130px] text-[12.5px]"
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
                        </Select>
                      </Td>
                      <Td align="right" onClick={(e: any) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditing(t); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Delete" className="hover:text-red-600" onClick={() => setDeleting(t)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </Table>
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={(p) => set({ page: p })} />
        </TableShell>
      )}

      <MoveTaskModal
        move={moving}
        onClose={() => setMoving(null)}
        onConfirm={(note) =>
          moving && changeStatus.mutate({ id: moving.task.id, status: moving.status, note })
        }
        pending={changeStatus.isPending}
      />

      <TaskFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        task={editing}
        projects={projects}
        assignees={assignees}
      />
      <TaskDetailModal
        taskId={detail}
        onClose={() => { setDetail(null); set({ taskId: undefined }); }}
        onEdit={(t) => { setDetail(null); setEditing(t); setFormOpen(true); }}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Delete this task?"
        message={<>“{deleting?.title}” will be removed. Its audit history stays in the log.</>}
      />
    </>
  );
}

function TaskCard({ task: t, onOpen, onStatus }: { task: Task; onOpen: () => void; onStatus: (s: TaskStatus) => void }) {
  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE';
  return (
    <motion.div
      variants={itemVariants}
      layout
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onOpen}
      className="surface cursor-pointer rounded-xl p-3 transition-colors duration-150 hover:border-[color:var(--border-strong)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">{t.title}</p>
        <StatusPill status={t.priority} dot={false} animateChange={false} className="shrink-0" />
        {t.severity && (
          <StatusPill status={t.severity} label={t.severity} dot={false} animateChange={false} className="shrink-0" />
        )}
      </div>

      <div className="text-muted mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
        <span className="font-medium">{t.project.code}</span>
        {t.module && <span>· {t.module.name}</span>}
        {t.ticketId && <span className="font-mono">· {t.ticketId}</span>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size="xs" />
          <span className="text-muted truncate text-[11.5px]">{t.assignee.name.split(' ')[0]}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {t.mrUrl && <GitPullRequest className="text-muted h-3.5 w-3.5" />}
          {t.dueDate && (
            <span className={cn('text-[11.5px]', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
              {fmtDate(t.dueDate, 'd MMM')}
            </span>
          )}
        </div>
      </div>

      {/* Quiet move control — the column heading already states the current status. */}
      <div onClick={(e) => e.stopPropagation()} className="mt-2">
        <Select
          value={t.status}
          onChange={(e) => onStatus(e.target.value as TaskStatus)}
          aria-label="Move task"
          className="text-muted h-7 border-transparent bg-transparent pl-2 text-[11.5px] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === t.status ? 'Move to…' : humanise(s)}</option>
          ))}
        </Select>
      </div>
    </motion.div>
  );
}

function TaskFormModal({
  open, onClose, task, projects, assignees,
}: {
  open: boolean; onClose: () => void; task?: Task | null;
  projects: ProjectOption[]; assignees: UserRef[];
}) {
  const qc = useQueryClient();
  const { user, canManage } = useAuth();
  const editing = !!task;

  const [form, setForm] = useState({
    title: '', description: '', projectId: '', moduleId: '', subModuleId: '',
    assigneeId: '', status: 'TODO', priority: 'MEDIUM', severity: '', dueDate: '',
    ticketId: '', ticketUrl: '', mrUrl: '', mrTitle: '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      title: task?.title ?? '',
      description: task?.description ?? '',
      projectId: task?.projectId ?? '',
      moduleId: task?.module?.id ?? '',
      subModuleId: task?.subModule?.id ?? '',
      assigneeId: task?.assignee.id ?? (canManage ? '' : user?.id ?? ''),
      status: task?.status ?? 'TODO',
      priority: task?.priority ?? 'MEDIUM',
      severity: task?.severity ?? '',
      dueDate: task?.dueDate?.slice(0, 10) ?? '',
      ticketId: task?.ticketId ?? '',
      ticketUrl: task?.ticketUrl ?? '',
      mrUrl: task?.mrUrl ?? '',
      mrTitle: task?.mrTitle ?? '',
    });
  }, [open, task]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const project = projects.find((p) => p.id === form.projectId);
  const module = project?.modules.find((m) => m.id === form.moduleId);

  const save = useMutation({
    mutationFn: (): Promise<unknown> => {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description || undefined,
        moduleId: form.moduleId || undefined,
        subModuleId: form.subModuleId || undefined,
        assigneeId: form.assigneeId || undefined,
        status: form.status,
        priority: form.priority,
        severity: form.severity || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        ticketId: form.ticketId || undefined,
        ticketUrl: form.ticketUrl || undefined,
        mrUrl: form.mrUrl || undefined,
        mrTitle: form.mrTitle || undefined,
      };
      if (editing) return api.patch(`/tasks/${task!.id}`, payload);
      return api.post('/tasks', { ...payload, projectId: form.projectId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-stats'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success(editing ? 'Task updated' : 'Task created');
      onClose();
    },
    onError: (e) => setError(extractMessage(e)),
  });

  const valid = form.title.trim().length > 1 && (editing || !!form.projectId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit task' : 'New task'}
      description={
        canManage
          ? 'Assign to anyone on your projects. Ticket details are recorded locally for visibility.'
          : 'Tasks you create are assigned to you.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {editing ? 'Save task' : 'Create task'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="What needs doing?" autoFocus />
        </Field>

        <Field label="Project" required>
          <Select
            value={form.projectId}
            onChange={(e) => set({ projectId: e.target.value, moduleId: '', subModuleId: '' })}
            disabled={editing}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>

        <Field label="Assignee">
          <Select value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })} disabled={!canManage}>
            <option value="">{canManage ? 'Assign to me' : user?.name}</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>

        {!!project?.modules.length && (
          <Field label="Module">
            <Select value={form.moduleId} onChange={(e) => set({ moduleId: e.target.value, subModuleId: '' })}>
              <option value="">None</option>
              {project.modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        )}
        {!!module?.subModules.length && (
          <Field label="Sub-module">
            <Select value={form.subModuleId} onChange={(e) => set({ subModuleId: e.target.value })}>
              <option value="">None</option>
              {module.subModules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Status">
          <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{humanise(s)}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p} value={p}>{humanise(p)}</option>)}
          </Select>
        </Field>
        <Field label="Severity" hint="How bad the problem is. Priority is what you do about it.">
          <Select value={form.severity} onChange={(e) => set({ severity: e.target.value })}>
            <option value="">Not set</option>
            {SEVERITIES.map((v) => <option key={v} value={v}>{SEVERITY_LABEL[v]}</option>)}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>

        <Field label="Description" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Context, acceptance criteria, links." />
        </Field>

        <div className="rounded-xl border bg-[color:var(--surface-sunken)] p-3.5 sm:col-span-2">
          <p className="mb-3 text-[12.5px] font-semibold">Ticket & merge request</p>
          <p className="text-muted mb-3 text-[11.5px]">
            Recorded locally for visibility — this isn't a live integration with the tracker.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ticket ID">
              <Input value={form.ticketId} onChange={(e) => set({ ticketId: e.target.value })} placeholder="e.g. AOP-231" />
            </Field>
            <Field label="Ticket link">
              <Input value={form.ticketUrl} onChange={(e) => set({ ticketUrl: e.target.value })} placeholder="https://…/browse/AOP-231" />
            </Field>
            <Field label="MR link">
              <Input value={form.mrUrl} onChange={(e) => set({ mrUrl: e.target.value })} placeholder="https://…/merge_requests/188" />
            </Field>
            <Field label="MR title">
              <Input value={form.mrTitle} onChange={(e) => set({ mrTitle: e.target.value })} placeholder="Short MR label" />
            </Field>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 sm:col-span-2 dark:text-red-400">{error}</p>
        )}
      </div>
    </Modal>
  );
}

function TaskDetailModal({
  taskId, onClose, onEdit,
}: {
  taskId: string | null; onClose: () => void; onEdit: (t: Task) => void;
}) {
  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
    enabled: !!taskId,
  });

  return (
    <Modal
      open={!!taskId}
      onClose={onClose}
      title={task?.title ?? 'Task'}
      description={task ? `${task.project.code} · ${task.project.name}` : undefined}
      footer={
        task && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => onEdit(task)}><Pencil className="h-4 w-4" /> Edit</Button>
          </>
        )
      }
    >
      {!task ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 animate-pulse rounded bg-[color:var(--surface-sunken)]" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            <StatusPill status={task.priority} dot={false} />
        {task.severity && <StatusPill status={task.severity} label={SEVERITY_LABEL[task.severity]} dot={false} />}
            {task.dueDate && (
              <span className="text-muted text-[12.5px]">Due {fmtDate(task.dueDate)}</span>
            )}
          </div>

          {task.description && (
            <p className="text-secondary text-[13px] leading-relaxed">{task.description}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Assignee">
              <span className="inline-flex items-center gap-2">
                <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size="xs" />
                {task.assignee.name}
              </span>
            </Detail>
            <Detail label="Created by">{task.createdBy.name}</Detail>
            <Detail label="Module">
              {task.module ? `${task.module.name}${task.subModule ? ` › ${task.subModule.name}` : ''}` : '—'}
            </Detail>
            <Detail label="Last updated">{fmtDateTime(task.updatedAt)}</Detail>
          </div>

          {(task.ticketId || task.mrUrl) && (
            <div className="rounded-xl border bg-[color:var(--surface-sunken)] p-3.5">
              <p className="mb-2.5 text-[12.5px] font-semibold">Ticket & merge request</p>
              <div className="space-y-2">
                {task.ticketId && (
                  <a
                    href={task.ticketUrl ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-secondary flex items-center gap-2 text-[13px] hover:text-[color:var(--text-primary)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="font-mono">{task.ticketId}</span>
                  </a>
                )}
                {task.mrUrl && (
                  <a
                    href={task.mrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-secondary flex items-center gap-2 truncate text-[13px] hover:text-[color:var(--text-primary)]"
                  >
                    <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{task.mrTitle ?? task.mrUrl}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {!!task.history?.length && (
            <div>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                <History className="h-3.5 w-3.5" /> History
              </p>
              <ul className="space-y-2.5 border-l pl-4">
                {task.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="bg-brand-500 absolute top-1.5 -left-[21px] h-2 w-2 rounded-full ring-4 ring-[color:var(--surface-card)]" />
                    <p className="text-[12.5px]">{h.summary}</p>
                    <p className="text-muted mt-0.5 text-[11.5px]">
                      {h.actorName} · {fmtDateTime(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">{label}</p>
      <p className="mt-1 text-[13px]">{children}</p>
    </div>
  );
}

/**
 * Confirms a status move and captures an optional reason. The reason lands in the
 * audit summary, so "why did this go back to Blocked?" is answerable later.
 */
function MoveTaskModal({
  move,
  onClose,
  onConfirm,
  pending,
}: {
  move: { task: Task; status: TaskStatus } | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (move) setNote('');
  }, [move]);

  return (
    <Modal
      open={!!move}
      onClose={onClose}
      title={move ? `Move to ${humanise(move.status)}` : 'Move ticket'}
      description={
        move
          ? `"${move.task.title}" — currently ${humanise(move.task.status)}.`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={() => onConfirm(note)}>
            Move to {move ? humanise(move.status) : ''}
          </Button>
        </>
      }
    >
      <Field
        label="Reason"
        hint="Optional. Recorded in the audit trail alongside the change."
      >
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Blocked on the CAA data feed"
          autoFocus
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter commits, so the optional field never slows you down.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onConfirm(note);
          }}
        />
      </Field>
    </Modal>
  );
}
